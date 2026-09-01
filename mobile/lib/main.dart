import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';

const _orange = Color(0xFFF58220);
const _ink = Color(0xFF171B18);
const _surface = Color(0xFFF7F5F0);
const _dark = Color(0xFF121714);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final auth = AuthController();
  await auth.initialise();
  runApp(DevaApp(auth: auth));
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
  static const _googleServerClientId = String.fromEnvironment(
    'DEVA_GOOGLE_SERVER_CLIENT_ID',
  );

  final FlutterSecureStorage _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(),
  );
  final GoogleSignIn _google = GoogleSignIn.instance;
  late final Dio _dio;

  bool loading = true;
  bool busy = false;
  String? error;
  String? token;
  Map<String, dynamic>? session;

  bool get signedIn => token != null && session != null;
  bool get pendingApproval => session?['pendingApproval'] == true;

  Map<String, dynamic> get user =>
      Map<String, dynamic>.from(session?['user'] as Map? ?? const {});
  Map<String, dynamic> get access =>
      Map<String, dynamic>.from(session?['access'] as Map? ?? const {});

  Future<void> initialise() async {
    final root = _apiUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    _dio = Dio(BaseOptions(
      baseUrl: '$root/api',
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 30),
      sendTimeout: const Duration(seconds: 30),
      headers: const {'Accept': 'application/json'},
    ));

    if (_googleServerClientId.isNotEmpty) {
      await _google.initialize(serverClientId: _googleServerClientId);
    } else {
      await _google.initialize();
    }

    token = await _storage.read(key: _tokenKey);
    if (token != null) {
      try {
        await refresh();
      } catch (_) {
        await _clearLocalSession();
      }
    }

    loading = false;
    notifyListeners();
  }

  Future<void> signInWithGoogle() async {
    if (busy) return;
    busy = true;
    error = null;
    notifyListeners();

    try {
      final account = await _google.authenticate();
      final credential = account.authentication.idToken;
      if (credential == null || credential.isEmpty) {
        throw StateError('Google Sign-In did not return an ID token.');
      }

      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/google',
        data: {'credential': credential},
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
      'pendingApproval': data['pendingApproval'] == true,
    };
    notifyListeners();
  }

  Future<void> signOut() async {
    busy = true;
    notifyListeners();
    try {
      await _google.signOut();
    } catch (_) {
      // Local Deva sign-out should still complete if Google sign-out fails.
    }
    await _clearLocalSession();
    busy = false;
    notifyListeners();
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
        return 'Could not connect to Deva. Check the API URL and your internet connection.';
      }
      return exception.message ?? 'Sign-in failed. Please try again.';
    }
    if (exception is GoogleSignInException) {
      return exception.description ?? 'Google Sign-In failed. Please try again.';
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
            Text('Deva', style: TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800)),
            SizedBox(height: 18),
            SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 2.6, color: _orange)),
          ],
        ),
      ),
    );
  }
}

class SignInScreen extends StatelessWidget {
  const SignInScreen({super.key, required this.auth});

  final AuthController auth;

  @override
  Widget build(BuildContext context) {
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
                  const Align(alignment: Alignment.centerLeft, child: DevaMark(size: 58)),
                  const SizedBox(height: 34),
                  const Text('Deva', style: TextStyle(fontSize: 48, height: .95, fontWeight: FontWeight.w800, letterSpacing: -2.2)),
                  const SizedBox(height: 14),
                  Text(
                    'Run your branches, stock, sales, restaurant and reports from the same account you use on the web.',
                    style: TextStyle(fontSize: 16, height: 1.55, color: Colors.grey.shade700),
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
                        const Text('Secure sign in', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 6),
                        Text('Use the Google account assigned by your Deva admin.', style: TextStyle(color: Colors.grey.shade600, height: 1.45)),
                        if (auth.error != null) ...[
                          const SizedBox(height: 14),
                          ErrorBanner(message: auth.error!),
                        ],
                        const SizedBox(height: 18),
                        FilledButton.icon(
                          onPressed: auth.busy ? null : auth.signInWithGoogle,
                          style: FilledButton.styleFrom(
                            minimumSize: const Size.fromHeight(52),
                            backgroundColor: _ink,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                          ),
                          icon: auth.busy
                              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.account_circle_outlined),
                          label: Text(auth.busy ? 'Signing in…' : 'Continue with Google'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    'Your access stays role-based. The app uses the same Deva API and database as the website.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600, height: 1.5),
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

class PendingScreen extends StatelessWidget {
  const PendingScreen({super.key, required this.auth});

  final AuthController auth;

  @override
  Widget build(BuildContext context) {
    final email = auth.user['email'] ?? '';
    return Scaffold(
      appBar: AppBar(title: const Text('Deva'), actions: [IconButton(onPressed: auth.signOut, icon: const Icon(Icons.logout))]),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Card(
              elevation: 0,
              shape: RoundedRectangleBorder(side: const BorderSide(color: Color(0xFFE2DFD8)), borderRadius: BorderRadius.circular(20)),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    const DevaMark(size: 58),
                    const SizedBox(height: 18),
                    const Text('Access not assigned yet', textAlign: TextAlign.center, style: TextStyle(fontSize: 25, fontWeight: FontWeight.w800, letterSpacing: -.7)),
                    const SizedBox(height: 10),
                    Text('$email\n\nAsk your admin to assign your business, branch and job role. Then refresh your access.', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade700, height: 1.5)),
                    const SizedBox(height: 22),
                    FilledButton.icon(onPressed: auth.refresh, icon: const Icon(Icons.refresh), label: const Text('Refresh access')),
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

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 18,
        title: const Row(children: [DevaMark(size: 34), SizedBox(width: 10), Text('Deva', style: TextStyle(fontWeight: FontWeight.w800))]),
        actions: [
          IconButton(onPressed: auth.refresh, tooltip: 'Refresh', icon: const Icon(Icons.refresh)),
          IconButton(onPressed: auth.signOut, tooltip: 'Sign out', icon: const Icon(Icons.logout)),
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
              decoration: BoxDecoration(color: _dark, borderRadius: BorderRadius.circular(22)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Welcome back', style: TextStyle(color: Colors.white.withValues(alpha: .65), fontSize: 13)),
                  const SizedBox(height: 6),
                  Text(
                    '${user['name'] ?? user['email'] ?? 'Deva user'}',
                    style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -1),
                  ),
                  const SizedBox(height: 13),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _MetricChip(label: 'Businesses', value: '${tenants.length}'),
                      _MetricChip(label: 'Branches', value: '${branches.length}'),
                      _MetricChip(label: 'Access', value: access['isSuperAdmin'] == true ? 'Admin' : 'Active'),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),
            const Text('Your workspace', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -.6)),
            const SizedBox(height: 6),
            Text('These modules are derived from the same permissions used by the web app.', style: TextStyle(color: Colors.grey.shade600, height: 1.45)),
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
              itemBuilder: (context, index) => ModuleCard(module: modules[index]),
            ),
            if (branches.isNotEmpty) ...[
              const SizedBox(height: 30),
              const Text('Assigned branches', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -.5)),
              const SizedBox(height: 12),
              ...branches.map((raw) {
                final row = Map<String, dynamic>.from(raw as Map);
                final branch = Map<String, dynamic>.from(row['branch'] as Map? ?? const {});
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(15),
                  decoration: BoxDecoration(color: Colors.white, border: Border.all(color: const Color(0xFFE2DFD8)), borderRadius: BorderRadius.circular(14)),
                  child: Row(
                    children: [
                      const CircleAvatar(backgroundColor: Color(0xFFFFEFE1), foregroundColor: Color(0xFFB84F00), child: Icon(Icons.storefront_outlined)),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${branch['name'] ?? 'Branch'}', style: const TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 3),
                        Text('${branch['code'] ?? ''} · ${_roleLabel('${row['role'] ?? ''}')}', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                      ])),
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
  const ModuleInfo(this.label, this.caption, this.icon);
  final String label;
  final String caption;
  final IconData icon;
}

class ModuleCard extends StatelessWidget {
  const ModuleCard({super.key, required this.module});

  final ModuleInfo module;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('${module.label} mobile screen is the next Deva module to connect.')),
          );
        },
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(border: Border.all(color: const Color(0xFFE2DFD8)), borderRadius: BorderRadius.circular(16)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 39,
                height: 39,
                decoration: BoxDecoration(color: const Color(0xFFFFEFE1), borderRadius: BorderRadius.circular(11)),
                child: Icon(module.icon, color: const Color(0xFFB84F00), size: 21),
              ),
              const Spacer(),
              Text(module.label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
              const SizedBox(height: 3),
              Text(module.caption, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11, height: 1.35, color: Colors.grey.shade600)),
            ],
          ),
        ),
      ),
    );
  }
}

List<ModuleInfo> _modulesFor(Map<String, dynamic> access) {
  if (access['isSuperAdmin'] == true) {
    return const [
      ModuleInfo('Businesses', 'Business and tenant access', Icons.business_outlined),
      ModuleInfo('Branches', 'Outlet setup and control', Icons.storefront_outlined),
      ModuleInfo('Analytics', 'Business performance', Icons.query_stats_outlined),
      ModuleInfo('Reports', 'Operational reports', Icons.description_outlined),
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
      ModuleInfo('Branches', 'Manage all assigned outlets', Icons.storefront_outlined),
      ModuleInfo('Stock', 'Inventory, purchases and wastage', Icons.inventory_2_outlined),
      ModuleInfo('Sales', 'Orders and daily sales', Icons.receipt_long_outlined),
      ModuleInfo('Restaurant', 'Tables, menu and service', Icons.restaurant_outlined),
      ModuleInfo('Analytics', 'Sales, cost and profit', Icons.query_stats_outlined),
      ModuleInfo('Reports', 'Business and branch reports', Icons.description_outlined),
      ModuleInfo('Staff', 'People and branch roles', Icons.groups_outlined),
    ];
  }

  final modules = <ModuleInfo>[];
  if (roles.contains('BRANCH_MANAGER')) {
    modules.addAll(const [
      ModuleInfo('Stock', 'Inventory and purchases', Icons.inventory_2_outlined),
      ModuleInfo('Sales', 'Orders and daily sales', Icons.receipt_long_outlined),
      ModuleInfo('Restaurant', 'Tables, menu and service', Icons.restaurant_outlined),
      ModuleInfo('Analytics', 'Branch performance', Icons.query_stats_outlined),
      ModuleInfo('Reports', 'Branch reports', Icons.description_outlined),
    ]);
  }
  if (roles.contains('INVENTORY_MANAGER')) {
    modules.add(const ModuleInfo('Stock', 'Inventory and purchases', Icons.inventory_2_outlined));
  }
  if (roles.contains('WAITER')) {
    modules.add(const ModuleInfo('Orders', 'Tables and customer orders', Icons.room_service_outlined));
  }
  if (roles.contains('CASHIER')) {
    modules.add(const ModuleInfo('Billing', 'Bills and payments', Icons.point_of_sale_outlined));
  }
  if (roles.contains('AUDITOR')) {
    modules.addAll(const [
      ModuleInfo('Analytics', 'Branch performance', Icons.query_stats_outlined),
      ModuleInfo('Reports', 'Review branch reports', Icons.description_outlined),
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
      decoration: BoxDecoration(border: Border.all(color: Colors.white.withValues(alpha: .12)), borderRadius: BorderRadius.circular(9)),
      child: Text('$value  $label', style: TextStyle(color: Colors.white.withValues(alpha: .78), fontSize: 11, fontWeight: FontWeight.w600)),
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
      decoration: BoxDecoration(color: _orange, borderRadius: BorderRadius.circular(size * .24)),
      child: Icon(Icons.layers_rounded, size: size * .5, color: const Color(0xFF2B1505)),
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
      decoration: BoxDecoration(color: const Color(0xFFFFECEC), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFF3C6C6))),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.error_outline, size: 19, color: Color(0xFFB42318)),
        const SizedBox(width: 9),
        Expanded(child: Text(message, style: const TextStyle(color: Color(0xFF8A1C14), height: 1.4))),
      ]),
    );
  }
}
