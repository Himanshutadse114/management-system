import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _orange = Color(0xFFF58220);
const _ink = Color(0xFF171B18);
const _surface = Color(0xFFF7F5F0);
const _dark = Color(0xFF121714);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  ErrorWidget.builder =
      (details) => const ColoredBox(
        color: _surface,
        child: Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Something went wrong on this screen. Please go back and try again.',
              textAlign: TextAlign.center,
              style: TextStyle(color: _ink, fontSize: 16),
            ),
          ),
        ),
      );
  final auth = AuthController();
  await auth.initialise();
  runApp(DevaApp(auth: auth));
}

String _generatePassword([int length = 16]) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#%*-_';
  final random = Random.secure();
  final characters = <String>[
    upper[random.nextInt(upper.length)],
    lower[random.nextInt(lower.length)],
    numbers[random.nextInt(numbers.length)],
    symbols[random.nextInt(symbols.length)],
  ];
  final all = '$upper$lower$numbers$symbols';
  while (characters.length < length) {
    characters.add(all[random.nextInt(all.length)]);
  }
  characters.shuffle(random);
  return characters.join();
}

String _generateRecoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  final random = Random.secure();
  String block() =>
      List.generate(5, (_) => alphabet[random.nextInt(alphabet.length)]).join();
  return 'DEVA-${block()}-${block()}-${block()}';
}

Future<void> _disposeAfterDialog(
  Iterable<TextEditingController> controllers,
) async {
  await Future<void>.delayed(const Duration(milliseconds: 350));
  for (final controller in controllers) {
    controller.dispose();
  }
}

class DevaApp extends StatelessWidget {
  const DevaApp({super.key, required this.auth});

  final AuthController auth;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Deva',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: 'Roboto',
        scaffoldBackgroundColor: _surface,
        colorScheme: ColorScheme.fromSeed(
          seedColor: _orange,
          brightness: Brightness.light,
          surface: Colors.white,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: _ink,
          elevation: 0,
          surfaceTintColor: Colors.transparent,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: Color(0xFFE2DFD8)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: Color(0xFFE2DFD8)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: _orange, width: 1.5),
          ),
        ),
      ),
      home: AnimatedBuilder(
        animation: auth,
        builder: (context, _) {
          if (auth.loading) return const SplashScreen();
          if (!auth.signedIn) return SignInScreen(auth: auth);
          if (auth.mustChangePassword) return ChangePasswordScreen(auth: auth);
          if (auth.pendingApproval) return PendingScreen(auth: auth);
          return HomeScreen(auth: auth);
        },
      ),
    );
  }
}

class AuthController extends ChangeNotifier {
  static const _tokenKey = 'deva_token';
  static const _apiUrl = String.fromEnvironment(
    'DEVA_API_URL',
    defaultValue: 'http://10.0.2.2:5001',
  );

  final FlutterSecureStorage _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  late final Dio _dio;

  bool loading = true;
  bool busy = false;
  String? error;
  String? token;
  Map<String, dynamic>? session;

  bool get signedIn => token != null && session != null;
  bool get pendingApproval => session?['pendingApproval'] == true;
  bool get mustChangePassword =>
      (session?['credential'] as Map?)?['mustChangePassword'] == true;

  Map<String, dynamic> get user =>
      Map<String, dynamic>.from(session?['user'] as Map? ?? const {});
  Map<String, dynamic> get access =>
      Map<String, dynamic>.from(session?['access'] as Map? ?? const {});

  Future<void> initialise() async {
    final root = _apiUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    _dio = Dio(
      BaseOptions(
        baseUrl: '$root/api',
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 30),
        sendTimeout: const Duration(seconds: 30),
        headers: const {'Accept': 'application/json'},
      ),
    );

    try {
      token = await _storage.read(key: _tokenKey);
      if (token != null) {
        await refresh();
      }
    } catch (_) {
      token = null;
      session = null;
      try {
        await _storage.delete(key: _tokenKey);
      } catch (_) {
        // The sign-in screen must still open if Android secure storage is damaged.
      }
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> signIn(String username, String password) async {
    if (busy) return;
    busy = true;
    error = null;
    notifyListeners();

    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/password',
        data: {'username': username.trim(), 'password': password},
      );
      final data = response.data ?? const <String, dynamic>{};
      final nextToken = data['token'] as String?;
      if (nextToken == null || nextToken.isEmpty) {
        throw StateError('Deva did not return a session token.');
      }

      token = nextToken;
      session = {
        'user': data['user'],
        'access': data['access'],
        'credential': data['credential'],
        'pendingApproval': data['pendingApproval'] == true,
      };
      await _storage.write(key: _tokenKey, value: token);
    } catch (exception) {
      error = _message(exception);
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> refresh() async {
    final activeToken = token;
    if (activeToken == null) return;

    final response = await _dio.get<Map<String, dynamic>>(
      '/auth/status',
      options: Options(headers: {'Authorization': 'Bearer $activeToken'}),
    );
    final data = response.data ?? const <String, dynamic>{};
    session = {
      'user': data['user'],
      'access': data['access'],
      'credential': data['credential'],
      'pendingApproval': data['pendingApproval'] == true,
    };
    notifyListeners();
  }

  Future<void> signOut() async {
    busy = true;
    notifyListeners();
    await _clearLocalSession();
    busy = false;
    notifyListeners();
  }

  Future<bool> changePassword(
    String currentPassword,
    String newPassword,
  ) async {
    if (busy) return false;
    busy = true;
    error = null;
    notifyListeners();
    try {
      final response = await post(
        '/auth/change-password',
        data: {'currentPassword': currentPassword, 'newPassword': newPassword},
      );
      final data = response.data as Map<String, dynamic>;
      token = data['token'] as String? ?? token;
      session = {
        'user': data['user'],
        'access': data['access'],
        'credential': data['credential'],
        'pendingApproval': data['pendingApproval'] == true,
      };
      await _storage.write(key: _tokenKey, value: token);
      return true;
    } catch (exception) {
      error = _message(exception);
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Options get _authOptions =>
      Options(headers: {'Authorization': 'Bearer $token'});

  Future<Response<dynamic>> get(String path) =>
      _dio.get<dynamic>(path, options: _authOptions);

  Future<Response<dynamic>> post(String path, {Object? data}) =>
      _dio.post<dynamic>(path, data: data, options: _authOptions);

  Future<Response<dynamic>> patch(String path, {Object? data}) =>
      _dio.patch<dynamic>(path, data: data, options: _authOptions);

  Future<Response<dynamic>> delete(String path, {Object? data}) =>
      _dio.delete<dynamic>(path, data: data, options: _authOptions);

  Future<void> recoverPassword(
    String username,
    String recoveryCode,
    String newPassword,
  ) async {
    await _dio.post<dynamic>(
      '/auth/recover-password',
      data: {
        'username': username.trim(),
        'recoveryCode': recoveryCode.trim(),
        'newPassword': newPassword,
      },
    );
  }

  Future<void> _clearLocalSession() async {
    token = null;
    session = null;
    error = null;
    await _storage.delete(key: _tokenKey);
  }

  String _message(Object exception) {
    if (exception is DioException) {
      final data = exception.response?.data;
      if (data is Map && data['message'] != null) return '${data['message']}';
      if (exception.type == DioExceptionType.connectionError ||
          exception.type == DioExceptionType.connectionTimeout) {
        return 'Could not connect to Deva. Check your internet connection and try again.';
      }
      return exception.message ?? 'Sign-in failed. Please try again.';
    }
    return exception.toString().replaceFirst('Bad state: ', '');
  }
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: _dark,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DevaMark(size: 72),
            SizedBox(height: 18),
            Text(
              'Deva',
              style: TextStyle(
                color: Colors.white,
                fontSize: 30,
                fontWeight: FontWeight.w800,
              ),
            ),
            SizedBox(height: 18),
            SizedBox(
              width: 26,
              height: 26,
              child: CircularProgressIndicator(
                strokeWidth: 2.6,
                color: _orange,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.auth});

  final AuthController auth;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    await widget.auth.signIn(_username.text, _password.text);
  }

  Future<void> _forgotPassword() async {
    final username = TextEditingController(text: _username.text);
    final recoveryCode = TextEditingController();
    final newPassword = TextEditingController(text: _generatePassword());
    String? error;
    bool saving = false;
    final completed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder:
          (dialogContext) => StatefulBuilder(
            builder:
                (context, setDialogState) => AlertDialog(
                  title: const Text('Recover password'),
                  content: SizedBox(
                    width: 460,
                    child: SingleChildScrollView(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text(
                            'Use the private recovery code saved when the Super Admin or Business Owner account was created.',
                          ),
                          if (error != null) ...[
                            const SizedBox(height: 10),
                            ErrorBanner(message: error!),
                          ],
                          const SizedBox(height: 12),
                          TextField(
                            controller: username,
                            decoration: const InputDecoration(
                              labelText: 'Username',
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: recoveryCode,
                            decoration: const InputDecoration(
                              labelText: 'Recovery code',
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: newPassword,
                            decoration: InputDecoration(
                              labelText: 'New password',
                              suffixIcon: IconButton(
                                tooltip: 'Generate strong password',
                                onPressed:
                                    () => setDialogState(
                                      () =>
                                          newPassword.text =
                                              _generatePassword(),
                                    ),
                                icon: const Icon(Icons.auto_awesome_rounded),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed:
                          saving
                              ? null
                              : () => Navigator.pop(dialogContext, false),
                      child: const Text('Cancel'),
                    ),
                    FilledButton(
                      onPressed:
                          saving
                              ? null
                              : () async {
                                setDialogState(() {
                                  saving = true;
                                  error = null;
                                });
                                try {
                                  await widget.auth.recoverPassword(
                                    username.text,
                                    recoveryCode.text,
                                    newPassword.text,
                                  );
                                  if (dialogContext.mounted) {
                                    Navigator.pop(dialogContext, true);
                                  }
                                } catch (exception) {
                                  setDialogState(() {
                                    saving = false;
                                    error = _apiMessage(exception);
                                  });
                                }
                              },
                      child: Text(saving ? 'Resetting…' : 'Reset password'),
                    ),
                  ],
                ),
          ),
    );
    if (completed == true && mounted) {
      _username.text = username.text;
      _password.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Password reset. Sign in with the new password.'),
        ),
      );
    }
    await _disposeAfterDialog([username, recoveryCode, newPassword]);
  }

  @override
  Widget build(BuildContext context) {
    final auth = widget.auth;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: DevaMark(size: 58),
                  ),
                  const SizedBox(height: 34),
                  const Text(
                    'Deva',
                    style: TextStyle(
                      fontSize: 48,
                      height: .95,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -2.2,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'Run your branches, stock, sales, restaurant and reports with credentials issued by your administrator.',
                    style: TextStyle(
                      fontSize: 16,
                      height: 1.55,
                      color: Colors.grey.shade700,
                    ),
                  ),
                  const SizedBox(height: 30),
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(color: const Color(0xFFE2DFD8)),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Sign in to Deva',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Use the username and password assigned by your business administrator.',
                          style: TextStyle(
                            color: Colors.grey.shade600,
                            height: 1.45,
                          ),
                        ),
                        if (auth.error != null) ...[
                          const SizedBox(height: 14),
                          ErrorBanner(message: auth.error!),
                        ],
                        const SizedBox(height: 18),
                        TextField(
                          controller: _username,
                          textInputAction: TextInputAction.next,
                          autocorrect: false,
                          enableSuggestions: false,
                          decoration: const InputDecoration(
                            labelText: 'Username',
                            prefixIcon: Icon(Icons.person_rounded),
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _password,
                          obscureText: _obscure,
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) => _submit(),
                          autocorrect: false,
                          enableSuggestions: false,
                          decoration: InputDecoration(
                            labelText: 'Password',
                            prefixIcon: const Icon(Icons.lock_rounded),
                            suffixIcon: IconButton(
                              onPressed:
                                  () => setState(() => _obscure = !_obscure),
                              icon: Icon(
                                _obscure
                                    ? Icons.visibility_rounded
                                    : Icons.visibility_off_rounded,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 18),
                        FilledButton.icon(
                          onPressed: auth.busy ? null : _submit,
                          style: FilledButton.styleFrom(
                            minimumSize: const Size.fromHeight(52),
                            backgroundColor: _ink,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(13),
                            ),
                          ),
                          icon:
                              auth.busy
                                  ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                  : const Icon(Icons.login_rounded),
                          label: Text(auth.busy ? 'Signing in…' : 'Sign in'),
                        ),
                        TextButton(
                          onPressed: auth.busy ? null : _forgotPassword,
                          child: const Text('Forgot password?'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    'Super Admin creates business owners. Business owners create staff accounts and control each role.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade600,
                      height: 1.5,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key, required this.auth});
  final AuthController auth;

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  String? _localError;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_next.text != _confirm.text) {
      setState(() => _localError = 'New passwords do not match.');
      return;
    }
    setState(() => _localError = null);
    await widget.auth.changePassword(_current.text, _next.text);
  }

  @override
  Widget build(BuildContext context) {
    final auth = widget.auth;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Secure your account'),
        actions: [
          IconButton(
            onPressed: auth.signOut,
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Card(
              elevation: 0,
              child: Padding(
                padding: const EdgeInsets.all(22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(
                      Icons.admin_panel_settings_rounded,
                      color: _orange,
                      size: 48,
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'Change the temporary password',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Use at least 10 characters with uppercase, lowercase and a number. Administrators cannot view this password later.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.grey.shade700,
                        height: 1.45,
                      ),
                    ),
                    if (_localError != null || auth.error != null) ...[
                      const SizedBox(height: 16),
                      ErrorBanner(message: _localError ?? auth.error!),
                    ],
                    const SizedBox(height: 20),
                    TextField(
                      controller: _current,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'Temporary password',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _next,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'New password',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _confirm,
                      obscureText: true,
                      onSubmitted: (_) => _save(),
                      decoration: const InputDecoration(
                        labelText: 'Confirm new password',
                      ),
                    ),
                    const SizedBox(height: 18),
                    FilledButton.icon(
                      onPressed: auth.busy ? null : _save,
                      icon:
                          auth.busy
                              ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                              : const Icon(Icons.check_circle_rounded),
                      label: const Text('Save private password'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class PendingScreen extends StatelessWidget {
  const PendingScreen({super.key, required this.auth});

  final AuthController auth;

  @override
  Widget build(BuildContext context) {
    final email = auth.user['email'] ?? '';
    return Scaffold(
      appBar: AppBar(
        title: const Text('Deva'),
        actions: [
          IconButton(onPressed: auth.signOut, icon: const Icon(Icons.logout)),
        ],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                side: const BorderSide(color: Color(0xFFE2DFD8)),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    const DevaMark(size: 58),
                    const SizedBox(height: 18),
                    const Text(
                      'Access not assigned yet',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 25,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -.7,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      '$email\n\nAsk your admin to assign your business, branch and job role. Then refresh your access.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.grey.shade700,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 22),
                    FilledButton.icon(
                      onPressed: auth.refresh,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Refresh access'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.auth});

  final AuthController auth;

  @override
  Widget build(BuildContext context) {
    final user = auth.user;
    final access = auth.access;
    final modules = _modulesFor(access);
    final branches = (access['branches'] as List?) ?? const [];
    final tenants = (access['tenants'] as List?) ?? const [];
    final isSuperAdmin = access['isSuperAdmin'] == true;
    final isTenantAdmin = tenants.any(
      (row) => (row as Map)['role'] == 'TENANT_ADMIN',
    );

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 18,
        title: const Row(
          children: [
            DevaMark(size: 34),
            SizedBox(width: 10),
            Text('Deva', style: TextStyle(fontWeight: FontWeight.w800)),
          ],
        ),
        actions: [
          IconButton(
            onPressed: auth.refresh,
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            onPressed: auth.signOut,
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: auth.refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 32),
          children: [
            Container(
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                color: _dark,
                borderRadius: BorderRadius.circular(22),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Welcome back',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: .65),
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${user['name'] ?? user['email'] ?? 'Deva user'}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -1,
                    ),
                  ),
                  const SizedBox(height: 13),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _MetricChip(
                        label: 'Businesses',
                        value: '${tenants.length}',
                      ),
                      _MetricChip(
                        label: 'Branches',
                        value: '${branches.length}',
                      ),
                      _MetricChip(
                        label: 'Access',
                        value:
                            access['isSuperAdmin'] == true ? 'Admin' : 'Active',
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (isSuperAdmin || isTenantAdmin) ...[
              const SizedBox(height: 14),
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                  backgroundColor: _orange,
                  foregroundColor: const Color(0xFF2B1505),
                ),
                onPressed:
                    () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder:
                            (_) =>
                                isSuperAdmin
                                    ? SuperAdminScreen(auth: auth)
                                    : OwnerAdminScreen(auth: auth),
                      ),
                    ),
                icon: Icon(
                  isSuperAdmin
                      ? Icons.business_rounded
                      : Icons.manage_accounts_rounded,
                ),
                label: Text(
                  isSuperAdmin
                      ? 'Manage businesses & owners'
                      : 'Manage branches & staff',
                ),
              ),
            ],
            const SizedBox(height: 28),
            const Text(
              'Your workspace',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                letterSpacing: -.6,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Your available tools are based on your assigned role and branch permissions.',
              style: TextStyle(color: Colors.grey.shade600, height: 1.45),
            ),
            const SizedBox(height: 16),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: modules.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.18,
              ),
              itemBuilder:
                  (context, index) =>
                      ModuleCard(module: modules[index], auth: auth),
            ),
            if (branches.isNotEmpty) ...[
              const SizedBox(height: 30),
              const Text(
                'Assigned branches',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -.5,
                ),
              ),
              const SizedBox(height: 12),
              ...branches.map((raw) {
                final row = Map<String, dynamic>.from(raw as Map);
                final branch = Map<String, dynamic>.from(
                  row['branch'] as Map? ?? const {},
                );
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(15),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: const Color(0xFFE2DFD8)),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      const CircleAvatar(
                        backgroundColor: Color(0xFFFFEFE1),
                        foregroundColor: Color(0xFFB84F00),
                        child: Icon(Icons.storefront_outlined),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${branch['name'] ?? 'Branch'}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              '${branch['code'] ?? ''} · ${_roleLabel('${row['role'] ?? ''}')}',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey.shade600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right, color: Color(0xFF8B918B)),
                    ],
                  ),
                );
              }),
            ],
          ],
        ),
      ),
    );
  }
}

class ModuleInfo {
  const ModuleInfo(
    this.label,
    this.caption,
    this.icon, [
    this.features = const [],
  ]);
  final String label;
  final String caption;
  final IconData icon;
  final List<String> features;
}

class ModuleCard extends StatelessWidget {
  const ModuleCard({super.key, required this.module, required this.auth});

  final ModuleInfo module;
  final AuthController auth;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap:
            () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ModuleDetailsScreen(module: module, auth: auth),
              ),
            ),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFE2DFD8)),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 39,
                height: 39,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFEFE1),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Icon(
                  module.icon,
                  color: const Color(0xFFB84F00),
                  size: 21,
                ),
              ),
              const Spacer(),
              Text(
                module.label,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                module.caption,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11,
                  height: 1.35,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ModuleDetailsScreen extends StatelessWidget {
  const ModuleDetailsScreen({
    super.key,
    required this.module,
    required this.auth,
  });
  final ModuleInfo module;
  final AuthController auth;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(module.label)),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              color: _dark,
              borderRadius: BorderRadius.circular(22),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(module.icon, color: _orange, size: 36),
                const SizedBox(height: 16),
                Text(
                  module.label,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  module.caption,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: .72),
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          const Text(
            'Current platform coverage',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 10),
          if (module.features.isEmpty)
            const _FeatureRow(label: 'Role-based access and live Deva data')
          else
            ...module.features.map((feature) => _FeatureRow(label: feature)),
          if (auth.access['isSuperAdmin'] != true) ...[
            const SizedBox(height: 22),
            LiveModuleSummary(auth: auth, module: module),
          ],
          const SizedBox(height: 18),
          Text(
            'This area follows the same role permissions and backend workflows as the current Deva platform. High-risk actions remain protected by the server even if the app is modified.',
            style: TextStyle(color: Colors.grey.shade700, height: 1.5),
          ),
        ],
      ),
    );
  }
}

class LiveModuleSummary extends StatefulWidget {
  const LiveModuleSummary({
    super.key,
    required this.auth,
    required this.module,
  });
  final AuthController auth;
  final ModuleInfo module;

  @override
  State<LiveModuleSummary> createState() => _LiveModuleSummaryState();
}

class _LiveModuleSummaryState extends State<LiveModuleSummary> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _data = const {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final access = widget.auth.access;
      final tenants = (access['tenants'] as List?) ?? const [];
      final memberships = (access['branches'] as List?) ?? const [];
      final String? tenantId =
          tenants.isNotEmpty
              ? '${(tenants.first as Map)['tenantId']}'
              : memberships.isNotEmpty
              ? '${(memberships.first as Map)['tenantId']}'
              : null;
      String? branchId =
          memberships.isNotEmpty
              ? '${(memberships.first as Map)['branchId']}'
              : null;
      final tenantAdmin = tenants.any(
        (row) => (row as Map)['role'] == 'TENANT_ADMIN',
      );

      if (tenantId != null && branchId == null) {
        final response = await widget.auth.get('/tenants/$tenantId/branches');
        final rows = (response.data as Map)['branches'] as List? ?? const [];
        if (rows.isNotEmpty) branchId = '${(rows.first as Map)['id']}';
      }

      final label = widget.module.label;
      String? path;
      if (label == 'Branches' && tenantId != null) {
        path = '/tenants/$tenantId/branches';
      } else if (label == 'Reports') {
        path = '/reports/catalog';
      } else if (label == 'Sales & Profit' && tenantId != null) {
        path =
            tenantAdmin
                ? '/analytics/tenants/$tenantId/overview'
                : branchId == null
                ? null
                : '/analytics/tenants/$tenantId/branches/$branchId/overview';
      } else if (tenantId != null && branchId != null) {
        path = switch (label) {
          'Stock' => '/inventory/tenants/$tenantId/branches/$branchId/summary',
          'Sales' => '/sales/tenants/$tenantId/branches/$branchId/summary',
          'Billing' =>
            '/sales/cashier/tenants/$tenantId/branches/$branchId/summary',
          'Restaurant' =>
            '/restaurant/tenants/$tenantId/branches/$branchId/unresolved',
          'Orders' =>
            '/restaurant/waiter/tenants/$tenantId/branches/$branchId/orders',
          'Growth' => '/growth/tenants/$tenantId/branches/$branchId/overview',
          'Owner Control' =>
            '/operations/tenants/$tenantId/branches/$branchId/overview',
          'Ecosystem' => '/ecosystem/tenants/$tenantId/branches/$branchId',
          'Settings' => '/settings/tenants/$tenantId/branches/$branchId',
          'Staff' => '/tenants/$tenantId/branches/$branchId/members',
          _ => null,
        };
      }

      if (path == null) {
        if (mounted) {
          setState(() => _error = 'Assign a branch to view live data.');
        }
        return;
      }
      final response = await widget.auth.get(path);
      final raw = response.data;
      if (mounted) {
        setState(() {
          _data =
              raw is Map
                  ? Map<String, dynamic>.from(raw)
                  : <String, dynamic>{'results': raw};
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = _apiMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _label(String value) => value
      .replaceAllMapped(
        RegExp(r'([a-z])([A-Z])'),
        (match) => '${match[1]} ${match[2]}',
      )
      .replaceAll('_', ' ')
      .split(' ')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(18),
          child: CircularProgressIndicator(),
        ),
      );
    }
    if (_error != null) return ErrorBanner(message: _error!);
    final metrics =
        _data.entries
            .where((entry) {
              final value = entry.value;
              return value is List ||
                  value is Map ||
                  value is num ||
                  value is String ||
                  value is bool;
            })
            .take(10)
            .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'Live branch snapshot',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
              ),
            ),
            IconButton(
              onPressed: _load,
              icon: const Icon(Icons.refresh_rounded),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (metrics.isEmpty)
          const _EmptyCard(
            message:
                'The live service is connected. No records are available yet.',
          ),
        ...metrics.map((entry) {
          final value = entry.value;
          final display =
              value is List
                  ? '${value.length}'
                  : value is Map
                  ? '${value.length} fields'
                  : '$value';
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: const Color(0xFFE2DFD8)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Expanded(child: Text(_label(entry.key))),
                Text(
                  display,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    color: Color(0xFFB84F00),
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}

class _FeatureRow extends StatelessWidget {
  const _FeatureRow({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 9),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: const Color(0xFFE2DFD8)),
      borderRadius: BorderRadius.circular(13),
    ),
    child: Row(
      children: [
        const Icon(
          Icons.check_circle_rounded,
          color: Color(0xFF2E7D32),
          size: 21,
        ),
        const SizedBox(width: 11),
        Expanded(
          child: Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    ),
  );
}

String _apiMessage(Object error) {
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map && data['message'] != null) return '${data['message']}';
    return error.message ?? 'The request failed.';
  }
  return '$error';
}

class SuperAdminScreen extends StatefulWidget {
  const SuperAdminScreen({super.key, required this.auth});
  final AuthController auth;
  @override
  State<SuperAdminScreen> createState() => _SuperAdminScreenState();
}

class _SuperAdminScreenState extends State<SuperAdminScreen> {
  bool _loading = true;
  String? _error;
  List<dynamic> _tenants = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await widget.auth.get('/platform/tenants');
      final data = Map<String, dynamic>.from(response.data as Map);
      if (mounted) {
        setState(() => _tenants = (data['tenants'] as List?) ?? const []);
      }
    } catch (error) {
      if (mounted) setState(() => _error = _apiMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _createBusiness() async {
    final name = TextEditingController();
    final slug = TextEditingController();
    final ownerName = TextEditingController();
    final username = TextEditingController();
    final email = TextEditingController();
    final password = TextEditingController(text: _generatePassword());
    final recoveryCode = TextEditingController(text: _generateRecoveryCode());
    String? dialogError;
    bool saving = false;
    final created = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder:
          (dialogContext) => StatefulBuilder(
            builder: (context, setDialogState) {
              Future<void> submit() async {
                setDialogState(() {
                  saving = true;
                  dialogError = null;
                });
                try {
                  await widget.auth.post(
                    '/platform/tenants',
                    data: {
                      'name': name.text,
                      'slug': slug.text,
                      'ownerName': ownerName.text,
                      'ownerUsername': username.text,
                      'ownerEmail': email.text,
                      'ownerPassword': password.text,
                      'ownerRecoveryCode': recoveryCode.text,
                    },
                  );
                  if (dialogContext.mounted) Navigator.pop(dialogContext, true);
                } catch (error) {
                  setDialogState(() {
                    saving = false;
                    dialogError = _apiMessage(error);
                  });
                }
              }

              return AlertDialog(
                title: const Text('Create business & owner'),
                content: SizedBox(
                  width: 480,
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (dialogError != null) ...[
                          ErrorBanner(message: dialogError!),
                          const SizedBox(height: 12),
                        ],
                        TextField(
                          controller: name,
                          decoration: const InputDecoration(
                            labelText: 'Business name *',
                          ),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: slug,
                          decoration: const InputDecoration(
                            labelText: 'URL slug (optional)',
                          ),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: ownerName,
                          decoration: const InputDecoration(
                            labelText: 'Owner name *',
                          ),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: username,
                          autocorrect: false,
                          decoration: const InputDecoration(
                            labelText: 'Owner username *',
                          ),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: email,
                          keyboardType: TextInputType.emailAddress,
                          decoration: const InputDecoration(
                            labelText: 'Owner email (optional)',
                          ),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: password,
                          decoration: InputDecoration(
                            labelText: 'Temporary password *',
                            helperText:
                                '10+ characters, upper/lowercase and a number',
                            suffixIcon: IconButton(
                              tooltip: 'Generate strong password',
                              onPressed:
                                  () => setDialogState(
                                    () => password.text = _generatePassword(),
                                  ),
                              icon: const Icon(Icons.auto_awesome_rounded),
                            ),
                          ),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: recoveryCode,
                          decoration: InputDecoration(
                            labelText: 'Private recovery code *',
                            helperText:
                                'Give this once to the owner for forgotten-password recovery.',
                            suffixIcon: IconButton(
                              tooltip: 'Generate recovery code',
                              onPressed:
                                  () => setDialogState(
                                    () =>
                                        recoveryCode.text =
                                            _generateRecoveryCode(),
                                  ),
                              icon: const Icon(Icons.key_rounded),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed:
                        saving
                            ? null
                            : () => Navigator.pop(dialogContext, false),
                    child: const Text('Cancel'),
                  ),
                  FilledButton(
                    onPressed: saving ? null : submit,
                    child: Text(saving ? 'Creating…' : 'Create'),
                  ),
                ],
              );
            },
          ),
    );
    await _disposeAfterDialog([
      name,
      slug,
      ownerName,
      username,
      email,
      password,
      recoveryCode,
    ]);
    if (created == true) await _load();
  }

  Future<void> _deleteBusiness(Map<String, dynamic> tenant) async {
    final confirmation = TextEditingController();
    final deleted = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder:
          (dialogContext) => StatefulBuilder(
            builder:
                (context, setDialogState) => AlertDialog(
                  scrollable: true,
                  insetPadding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 24,
                  ),
                  actionsAlignment: MainAxisAlignment.end,
                  actionsOverflowAlignment: OverflowBarAlignment.end,
                  actionsOverflowButtonSpacing: 8,
                  icon: const Icon(
                    Icons.delete_forever_rounded,
                    color: Colors.red,
                  ),
                  title: Text('Delete ${tenant['name']}?'),
                  content: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text(
                        'All owner, staff and branch access will stop immediately. Accounting and audit records will be retained safely.',
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: confirmation,
                        maxLines: 1,
                        textInputAction: TextInputAction.done,
                        scrollPadding: const EdgeInsets.only(bottom: 160),
                        onChanged: (_) => setDialogState(() {}),
                        decoration: InputDecoration(
                          labelText: 'Type ${tenant['name']} to confirm',
                        ),
                      ),
                    ],
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogContext, false),
                      child: const Text('Keep business'),
                    ),
                    FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.red.shade700,
                      ),
                      onPressed:
                          confirmation.text == '${tenant['name']}'
                              ? () async {
                                try {
                                  await widget.auth.delete(
                                    '/platform/tenants/${tenant['id']}',
                                    data: {
                                      'confirmationName': confirmation.text,
                                    },
                                  );
                                  if (dialogContext.mounted) {
                                    Navigator.pop(dialogContext, true);
                                  }
                                } catch (error) {
                                  if (dialogContext.mounted) {
                                    ScaffoldMessenger.of(
                                      dialogContext,
                                    ).showSnackBar(
                                      SnackBar(
                                        content: Text(_apiMessage(error)),
                                      ),
                                    );
                                  }
                                }
                              }
                              : null,
                      child: const Text('Delete business'),
                    ),
                  ],
                ),
          ),
    );
    await _disposeAfterDialog([confirmation]);
    if (deleted == true) await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Businesses & owners'),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _createBusiness,
        icon: const Icon(Icons.add_business_rounded),
        label: const Text('New business'),
      ),
      body:
          _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
              ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: ErrorBanner(message: _error!),
                ),
              )
              : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(18, 16, 18, 96),
                  children: [
                    const Text(
                      'Platform businesses',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Create a business with its first owner login. Owners then create branch and staff credentials.',
                      style: TextStyle(
                        color: Colors.grey.shade700,
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: 18),
                    if (_tenants.isEmpty)
                      const _EmptyCard(
                        message:
                            'No businesses yet. Create the first business and owner account.',
                      ),
                    ..._tenants.map((raw) {
                      final tenant = Map<String, dynamic>.from(raw as Map);
                      final active = tenant['status'] == 'ACTIVE';
                      return Card(
                        elevation: 0,
                        margin: const EdgeInsets.only(bottom: 10),
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          leading: CircleAvatar(
                            backgroundColor: const Color(0xFFFFE8D2),
                            child: Icon(
                              active
                                  ? Icons.business_rounded
                                  : Icons.business_center_rounded,
                              color: const Color(0xFFB84F00),
                            ),
                          ),
                          title: Text(
                            '${tenant['name']}',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          subtitle: Text(
                            '${tenant['slug']} · ${tenant['status']}',
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                tooltip: 'Delete business',
                                onPressed: () => _deleteBusiness(tenant),
                                icon: const Icon(
                                  Icons.delete_outline_rounded,
                                  color: Colors.red,
                                ),
                              ),
                              const Icon(Icons.chevron_right_rounded),
                            ],
                          ),
                          onTap:
                              () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder:
                                      (_) => BusinessOwnersScreen(
                                        auth: widget.auth,
                                        tenant: tenant,
                                      ),
                                ),
                              ),
                        ),
                      );
                    }),
                  ],
                ),
              ),
    );
  }
}

class BusinessOwnersScreen extends StatefulWidget {
  const BusinessOwnersScreen({
    super.key,
    required this.auth,
    required this.tenant,
  });
  final AuthController auth;
  final Map<String, dynamic> tenant;
  @override
  State<BusinessOwnersScreen> createState() => _BusinessOwnersScreenState();
}

class _BusinessOwnersScreenState extends State<BusinessOwnersScreen> {
  bool _loading = true;
  String? _error;
  List<dynamic> _admins = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await widget.auth.get(
        '/platform/tenants/${widget.tenant['id']}/admins',
      );
      final data = Map<String, dynamic>.from(response.data as Map);
      if (mounted) {
        setState(() => _admins = (data['admins'] as List?) ?? const []);
      }
    } catch (error) {
      if (mounted) setState(() => _error = _apiMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _reset(Map<String, dynamic> membership) async {
    final password = TextEditingController(text: _generatePassword());
    final confirmed = await showDialog<bool>(
      context: context,
      builder:
          (dialogContext) => AlertDialog(
            title: const Text('Reset owner password'),
            content: TextField(
              controller: password,
              decoration: InputDecoration(
                labelText: 'New temporary password',
                helperText: 'The owner must change it after sign in.',
                suffixIcon: IconButton(
                  onPressed: () => password.text = _generatePassword(),
                  icon: const Icon(Icons.auto_awesome_rounded),
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Reset'),
              ),
            ],
          ),
    );
    if (confirmed == true) {
      try {
        await widget.auth.post(
          '/platform/tenants/${widget.tenant['id']}/admins/${membership['id']}/reset-password',
          data: {'temporaryPassword': password.text},
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Temporary password updated.')),
          );
        }
        await _load();
      } catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(_apiMessage(error))));
        }
      }
    }
    await _disposeAfterDialog([password]);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text('${widget.tenant['name']} owners')),
    body:
        _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
            ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: ErrorBanner(message: _error!),
              ),
            )
            : ListView(
              padding: const EdgeInsets.all(18),
              children: [
                ..._admins.map((raw) {
                  final membership = Map<String, dynamic>.from(raw as Map);
                  final user = Map<String, dynamic>.from(
                    membership['user'] as Map? ?? const {},
                  );
                  final credential = Map<String, dynamic>.from(
                    user['credential'] as Map? ?? const {},
                  );
                  return Card(
                    elevation: 0,
                    child: ListTile(
                      leading: const CircleAvatar(
                        child: Icon(Icons.admin_panel_settings_rounded),
                      ),
                      title: Text(
                        '${user['name'] ?? credential['username'] ?? membership['email']}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        '${credential['username'] ?? 'Email invitation'} · ${membership['status']}${credential['mustChangePassword'] == true ? ' · password change required' : ''}',
                      ),
                      trailing:
                          credential.isEmpty
                              ? null
                              : IconButton(
                                onPressed: () => _reset(membership),
                                tooltip: 'Reset password',
                                icon: const Icon(Icons.key_rounded),
                              ),
                    ),
                  );
                }),
              ],
            ),
  );
}

class OwnerAdminScreen extends StatefulWidget {
  const OwnerAdminScreen({super.key, required this.auth});
  final AuthController auth;
  @override
  State<OwnerAdminScreen> createState() => _OwnerAdminScreenState();
}

class _OwnerAdminScreenState extends State<OwnerAdminScreen> {
  bool _loading = true;
  String? _error;
  late final String _tenantId;
  List<dynamic> _branches = const [];
  List<dynamic> _members = const [];
  String? _branchId;

  @override
  void initState() {
    super.initState();
    final tenants = (widget.auth.access['tenants'] as List?) ?? const [];
    final admin = tenants
        .cast<dynamic>()
        .map((row) => Map<String, dynamic>.from(row as Map))
        .firstWhere((row) => row['role'] == 'TENANT_ADMIN');
    _tenantId = '${admin['tenantId']}';
    _loadBranches();
  }

  Future<void> _loadBranches() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await widget.auth.get('/tenants/$_tenantId/branches');
      final data = Map<String, dynamic>.from(response.data as Map);
      _branches = (data['branches'] as List?) ?? const [];
      if (_branches.isNotEmpty &&
          !_branches.any((row) => '${(row as Map)['id']}' == _branchId)) {
        _branchId = '${(_branches.first as Map)['id']}';
      }
      await _loadMembers();
    } catch (error) {
      if (mounted) setState(() => _error = _apiMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMembers() async {
    if (_branchId == null) {
      if (mounted) setState(() => _members = const []);
      return;
    }
    final response = await widget.auth.get(
      '/tenants/$_tenantId/branches/$_branchId/members',
    );
    final data = Map<String, dynamic>.from(response.data as Map);
    if (mounted) {
      setState(() => _members = (data['memberships'] as List?) ?? const []);
    }
  }

  Future<void> _createBranch() async {
    final name = TextEditingController();
    final code = TextEditingController();
    final address = TextEditingController();
    String type = 'BAR_RESTAURANT';
    final accepted = await showDialog<bool>(
      context: context,
      builder:
          (dialogContext) => StatefulBuilder(
            builder:
                (context, setDialogState) => AlertDialog(
                  title: const Text('Create branch'),
                  content: SizedBox(
                    width: 460,
                    child: SingleChildScrollView(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          TextField(
                            controller: name,
                            decoration: const InputDecoration(
                              labelText: 'Branch name',
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: code,
                            decoration: const InputDecoration(
                              labelText: 'Branch code',
                            ),
                          ),
                          const SizedBox(height: 10),
                          DropdownButtonFormField<String>(
                            initialValue: type,
                            decoration: const InputDecoration(
                              labelText: 'Business type',
                            ),
                            items: const [
                              DropdownMenuItem(
                                value: 'BAR_RESTAURANT',
                                child: Text('Bar / Restaurant'),
                              ),
                              DropdownMenuItem(
                                value: 'WINE_SHOP',
                                child: Text('Wine shop'),
                              ),
                            ],
                            onChanged:
                                (value) =>
                                    setDialogState(() => type = value ?? type),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: address,
                            decoration: const InputDecoration(
                              labelText: 'Address (optional)',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogContext, false),
                      child: const Text('Cancel'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(dialogContext, true),
                      child: const Text('Create'),
                    ),
                  ],
                ),
          ),
    );
    if (accepted == true) {
      try {
        await widget.auth.post(
          '/tenants/$_tenantId/branches',
          data: {
            'name': name.text,
            'code': code.text,
            'type': type,
            'address': address.text,
          },
        );
        await _loadBranches();
      } catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(_apiMessage(error))));
        }
      }
    }
    await _disposeAfterDialog([name, code, address]);
  }

  Future<void> _createStaff() async {
    if (_branchId == null) return;
    final name = TextEditingController();
    final username = TextEditingController();
    final email = TextEditingController();
    final password = TextEditingController(text: _generatePassword());
    String role = 'WAITER';
    final accepted = await showDialog<bool>(
      context: context,
      builder:
          (dialogContext) => StatefulBuilder(
            builder:
                (context, setDialogState) => AlertDialog(
                  title: const Text('Create staff login'),
                  content: SizedBox(
                    width: 460,
                    child: SingleChildScrollView(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          TextField(
                            controller: name,
                            decoration: const InputDecoration(
                              labelText: 'Staff name',
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: username,
                            autocorrect: false,
                            decoration: const InputDecoration(
                              labelText: 'Username',
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: email,
                            keyboardType: TextInputType.emailAddress,
                            decoration: const InputDecoration(
                              labelText: 'Email (optional)',
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: password,
                            decoration: InputDecoration(
                              labelText: 'Temporary password',
                              helperText:
                                  '10+ characters, upper/lowercase and a number',
                              suffixIcon: IconButton(
                                tooltip: 'Generate strong password',
                                onPressed:
                                    () => setDialogState(
                                      () => password.text = _generatePassword(),
                                    ),
                                icon: const Icon(Icons.auto_awesome_rounded),
                              ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          DropdownButtonFormField<String>(
                            initialValue: role,
                            decoration: const InputDecoration(
                              labelText: 'Role',
                            ),
                            items: const [
                              DropdownMenuItem(
                                value: 'BRANCH_MANAGER',
                                child: Text('Branch Manager'),
                              ),
                              DropdownMenuItem(
                                value: 'INVENTORY_MANAGER',
                                child: Text('Stock Manager'),
                              ),
                              DropdownMenuItem(
                                value: 'CASHIER',
                                child: Text('Cashier'),
                              ),
                              DropdownMenuItem(
                                value: 'WAITER',
                                child: Text('Waiter'),
                              ),
                              DropdownMenuItem(
                                value: 'AUDITOR',
                                child: Text('Auditor'),
                              ),
                            ],
                            onChanged:
                                (value) =>
                                    setDialogState(() => role = value ?? role),
                          ),
                        ],
                      ),
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogContext, false),
                      child: const Text('Cancel'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(dialogContext, true),
                      child: const Text('Create'),
                    ),
                  ],
                ),
          ),
    );
    if (accepted == true) {
      try {
        await widget.auth.post(
          '/tenants/$_tenantId/branches/$_branchId/members',
          data: {
            'name': name.text,
            'username': username.text,
            'email': email.text,
            'temporaryPassword': password.text,
            'role': role,
          },
        );
        await _loadMembers();
      } catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(_apiMessage(error))));
        }
      }
    }
    await _disposeAfterDialog([name, username, email, password]);
  }

  Future<void> _toggleStatus(Map<String, dynamic> membership) async {
    final next = membership['status'] == 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await widget.auth.patch(
        '/tenants/$_tenantId/branches/$_branchId/members/${membership['id']}/status',
        data: {'status': next},
      );
      await _loadMembers();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(_apiMessage(error))));
      }
    }
  }

  Future<void> _resetPassword(Map<String, dynamic> membership) async {
    final password = TextEditingController(text: _generatePassword());
    final accepted = await showDialog<bool>(
      context: context,
      builder:
          (dialogContext) => AlertDialog(
            title: const Text('Reset staff password'),
            content: TextField(
              controller: password,
              decoration: InputDecoration(
                labelText: 'New temporary password',
                suffixIcon: IconButton(
                  onPressed: () => password.text = _generatePassword(),
                  icon: const Icon(Icons.auto_awesome_rounded),
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Reset'),
              ),
            ],
          ),
    );
    if (accepted == true) {
      try {
        await widget.auth.post(
          '/tenants/$_tenantId/branches/$_branchId/members/${membership['id']}/reset-password',
          data: {'temporaryPassword': password.text},
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Temporary password updated.')),
          );
        }
        await _loadMembers();
      } catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(_apiMessage(error))));
        }
      }
    }
    await _disposeAfterDialog([password]);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Branches & staff'),
        actions: [
          IconButton(
            onPressed: _loadBranches,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body:
          _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
              ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: ErrorBanner(message: _error!),
                ),
              )
              : ListView(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 90),
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Branches',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      TextButton.icon(
                        onPressed: _createBranch,
                        icon: const Icon(Icons.add_rounded),
                        label: const Text('Add branch'),
                      ),
                    ],
                  ),
                  if (_branches.isEmpty)
                    const _EmptyCard(
                      message: 'Create a branch before adding staff.',
                    ),
                  if (_branches.isNotEmpty)
                    DropdownButtonFormField<String>(
                      initialValue: _branchId,
                      decoration: const InputDecoration(
                        labelText: 'Selected branch',
                        prefixIcon: Icon(Icons.storefront_rounded),
                      ),
                      items:
                          _branches.map((raw) {
                            final branch = raw as Map;
                            return DropdownMenuItem(
                              value: '${branch['id']}',
                              child: Text(
                                '${branch['name']} · ${branch['code']}',
                              ),
                            );
                          }).toList(),
                      onChanged: (value) async {
                        setState(() => _branchId = value);
                        try {
                          await _loadMembers();
                        } catch (error) {
                          if (mounted) {
                            setState(() => _error = _apiMessage(error));
                          }
                        }
                      },
                    ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Staff access',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      FilledButton.icon(
                        onPressed: _branchId == null ? null : _createStaff,
                        icon: const Icon(Icons.person_add_rounded),
                        label: const Text('Add staff'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (_branchId != null && _members.isEmpty)
                    const _EmptyCard(
                      message: 'No staff accounts assigned to this branch.',
                    ),
                  ..._members.map((raw) {
                    final membership = Map<String, dynamic>.from(raw as Map);
                    final user = Map<String, dynamic>.from(
                      membership['user'] as Map? ?? const {},
                    );
                    final credential = Map<String, dynamic>.from(
                      user['credential'] as Map? ?? const {},
                    );
                    return Card(
                      elevation: 0,
                      margin: const EdgeInsets.only(bottom: 10),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          children: [
                            Row(
                              children: [
                                CircleAvatar(
                                  backgroundColor: const Color(0xFFFFE8D2),
                                  child: Text(
                                    (user['name'] ??
                                            credential['username'] ??
                                            'S')
                                        .toString()
                                        .characters
                                        .first
                                        .toUpperCase(),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '${user['name'] ?? credential['username'] ?? membership['email']}',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      const SizedBox(height: 3),
                                      Text(
                                        '${credential['username'] ?? 'Email invitation'} · ${_roleLabel('${membership['role']}')} · ${membership['status']}',
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: Colors.grey.shade700,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                if (credential.isNotEmpty)
                                  TextButton.icon(
                                    onPressed: () => _resetPassword(membership),
                                    icon: const Icon(
                                      Icons.key_rounded,
                                      size: 18,
                                    ),
                                    label: const Text('Reset password'),
                                  ),
                                TextButton.icon(
                                  onPressed: () => _toggleStatus(membership),
                                  icon: Icon(
                                    membership['status'] == 'ACTIVE'
                                        ? Icons.block_rounded
                                        : Icons.check_circle_rounded,
                                    size: 18,
                                  ),
                                  label: Text(
                                    membership['status'] == 'ACTIVE'
                                        ? 'Suspend'
                                        : 'Activate',
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
                ],
              ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: const Color(0xFFE2DFD8)),
      borderRadius: BorderRadius.circular(14),
    ),
    child: Row(
      children: [
        const Icon(Icons.info_rounded, color: _orange),
        const SizedBox(width: 10),
        Expanded(child: Text(message)),
      ],
    ),
  );
}

List<ModuleInfo> _modulesFor(Map<String, dynamic> access) {
  if (access['isSuperAdmin'] == true) {
    return const [
      ModuleInfo(
        'Businesses',
        'Create businesses and owner access',
        Icons.business_rounded,
        ['Business status', 'Owner usernames', 'Temporary password reset'],
      ),
      ModuleInfo(
        'Security',
        'Platform account controls',
        Icons.security_rounded,
        ['Role isolation', 'Login lockout', 'Audit history'],
      ),
    ];
  }

  final tenantRows = (access['tenants'] as List?) ?? const [];
  final branchRows = (access['branches'] as List?) ?? const [];
  final roles = <String>{
    ...tenantRows.map((row) => '${(row as Map)['role'] ?? ''}'),
    ...branchRows.map((row) => '${(row as Map)['role'] ?? ''}'),
  };

  if (roles.contains('TENANT_ADMIN')) {
    return const [
      ModuleInfo(
        'Branches',
        'Manage all assigned outlets',
        Icons.storefront_outlined,
      ),
      ModuleInfo(
        'Stock',
        'Inventory, purchases and control',
        Icons.inventory_2_rounded,
        [
          'Current stock',
          'Batches & expiry',
          'Stocktakes',
          'Purchases',
          'Transfers',
          'Returns',
          'Adjustments',
          'Suppliers',
        ],
      ),
      ModuleInfo(
        'Sales',
        'Billing, orders and shifts',
        Icons.receipt_long_rounded,
        [
          'Counter sales',
          'Order history',
          'Refunds',
          'Split tender',
          'Shift approval',
        ],
      ),
      ModuleInfo(
        'Restaurant',
        'Tables, kitchen and guests',
        Icons.restaurant_rounded,
        [
          'Orders',
          'Kitchen display',
          'Guest orders',
          'Reservations',
          'Tables & QR',
          'Menu & recipes',
        ],
      ),
      ModuleInfo(
        'Growth',
        'Customers and direct ordering',
        Icons.trending_up_rounded,
        [
          'Customers & loyalty',
          'Offers',
          'Direct store',
          'Channels',
          'Settlements',
          'Feedback',
        ],
      ),
      ModuleInfo(
        'Owner Control',
        'Group operating controls',
        Icons.account_tree_rounded,
        [
          'Procurement',
          'Vendors',
          'SOPs',
          'Workforce',
          'Central dispatch',
          'Automations',
        ],
      ),
      ModuleInfo(
        'Ecosystem',
        'Connected systems and devices',
        Icons.hub_rounded,
        ['API keys', 'Webhooks', 'Delivery health', 'Devices', 'Print queue'],
      ),
      ModuleInfo(
        'Sales & Profit',
        'Sales, costs and expenses',
        Icons.query_stats_rounded,
        [
          'Branch performance',
          'Payments',
          'Trends',
          'Products',
          'Stock & team',
          'Expenses',
        ],
      ),
      ModuleInfo(
        'Reports',
        'Create and download reports',
        Icons.description_rounded,
        ['Report catalogue', 'Generate reports', 'Report history', 'Downloads'],
      ),
      ModuleInfo(
        'Settings',
        'Branch operating configuration',
        Icons.settings_rounded,
        [
          'Tax & receipts',
          'Payments',
          'Operating hours',
          'Shift controls',
          'Devices',
        ],
      ),
      ModuleInfo('Staff', 'People and branch roles', Icons.groups_rounded, [
        'Create staff login',
        'Assign roles',
        'Suspend access',
        'Reset password',
      ]),
    ];
  }

  final modules = <ModuleInfo>[];
  if (roles.contains('BRANCH_MANAGER')) {
    modules.addAll(const [
      ModuleInfo(
        'Stock',
        'Inventory and purchases',
        Icons.inventory_2_outlined,
      ),
      ModuleInfo(
        'Sales',
        'Orders and daily sales',
        Icons.receipt_long_outlined,
      ),
      ModuleInfo(
        'Restaurant',
        'Tables, menu and service',
        Icons.restaurant_outlined,
      ),
      ModuleInfo(
        'Growth',
        'Customers, channels and offers',
        Icons.trending_up_rounded,
      ),
      ModuleInfo(
        'Owner Control',
        'Branch operating controls',
        Icons.account_tree_rounded,
      ),
      ModuleInfo('Ecosystem', 'Devices, APIs and webhooks', Icons.hub_rounded),
      ModuleInfo(
        'Sales & Profit',
        'Branch performance',
        Icons.query_stats_outlined,
      ),
      ModuleInfo('Reports', 'Branch reports', Icons.description_outlined),
      ModuleInfo('Settings', 'Branch configuration', Icons.settings_rounded),
    ]);
  }
  if (roles.contains('INVENTORY_MANAGER')) {
    modules.add(
      const ModuleInfo(
        'Stock',
        'Inventory and purchases',
        Icons.inventory_2_outlined,
      ),
    );
  }
  if (roles.contains('WAITER')) {
    modules.add(
      const ModuleInfo(
        'Orders',
        'Tables and customer orders',
        Icons.room_service_outlined,
      ),
    );
  }
  if (roles.contains('CASHIER')) {
    modules.add(
      const ModuleInfo(
        'Billing',
        'Bills and payments',
        Icons.point_of_sale_outlined,
      ),
    );
  }
  if (roles.contains('AUDITOR')) {
    modules.addAll(const [
      ModuleInfo(
        'Sales & Profit',
        'Branch performance',
        Icons.query_stats_outlined,
      ),
      ModuleInfo(
        'Reports',
        'Review branch reports',
        Icons.description_outlined,
      ),
    ]);
  }

  final seen = <String>{};
  return modules.where((module) => seen.add(module.label)).toList();
}

String _roleLabel(String role) {
  return switch (role) {
    'TENANT_ADMIN' => 'Business Admin',
    'BRANCH_MANAGER' => 'Branch Manager',
    'INVENTORY_MANAGER' => 'Stock Staff',
    'WAITER' => 'Waiter',
    'CASHIER' => 'Cashier',
    'AUDITOR' => 'Auditor',
    _ => role.replaceAll('_', ' '),
  };
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.white.withValues(alpha: .12)),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Text(
        '$value  $label',
        style: TextStyle(
          color: Colors.white.withValues(alpha: .78),
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class DevaMark extends StatelessWidget {
  const DevaMark({super.key, required this.size});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: _orange,
        borderRadius: BorderRadius.circular(size * .24),
      ),
      child: Icon(
        Icons.layers_rounded,
        size: size * .5,
        color: const Color(0xFF2B1505),
      ),
    );
  }
}

class ErrorBanner extends StatelessWidget {
  const ErrorBanner({super.key, required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFECEC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFF3C6C6)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, size: 19, color: Color(0xFFB42318)),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: Color(0xFF8A1C14), height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}
