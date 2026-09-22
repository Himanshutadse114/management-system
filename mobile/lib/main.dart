import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

const _orange = Color(0xFFF58220);
const _ink = Color(0xFF171B18);
const _surface = Color(0xFFF7F5F0);
const _downloadsChannel = MethodChannel('com.deva.deva/downloads');

String safeDownloadName(String? value) {
  final cleaned =
      (value ?? 'deva-download')
          .replaceAll(RegExp(r'[^A-Za-z0-9._ -]'), '_')
          .trim();
  return cleaned.isEmpty ? 'deva-download' : cleaned;
}

Uint8List decodeDownloadDataUrl(String value) {
  final separator = value.indexOf(',');
  if (separator < 0) throw const FormatException('Missing file content');
  return base64Decode(value.substring(separator + 1));
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  ErrorWidget.builder =
      (_) => const ColoredBox(
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
  runApp(const DevaApp());
}

class DevaApp extends StatelessWidget {
  const DevaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Deva',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: _surface,
        colorScheme: ColorScheme.fromSeed(
          seedColor: _orange,
          brightness: Brightness.light,
          surface: Colors.white,
        ),
      ),
      home: const WebPlatformScreen(),
    );
  }
}

class WebPlatformScreen extends StatefulWidget {
  const WebPlatformScreen({super.key});

  @override
  State<WebPlatformScreen> createState() => _WebPlatformScreenState();
}

class _WebPlatformScreenState extends State<WebPlatformScreen> {
  static const _webUrl = String.fromEnvironment(
    'DEVA_WEB_URL',
    defaultValue: 'https://management-system-1-4y2u.onrender.com',
  );

  late final WebViewController _controller;
  int _progress = 0;
  bool _pageFailed = false;

  @override
  void initState() {
    super.initState();
    final controller =
        WebViewController()
          ..setJavaScriptMode(JavaScriptMode.unrestricted)
          ..setBackgroundColor(_surface)
          ..addJavaScriptChannel(
            'DevaDownload',
            onMessageReceived: _handleDownload,
          )
          ..setNavigationDelegate(
            NavigationDelegate(
              onProgress: (progress) {
                if (mounted) setState(() => _progress = progress);
              },
              onPageStarted: (_) {
                if (!mounted) return;
                setState(() {
                  _pageFailed = false;
                  _progress = 0;
                });
              },
              onPageFinished: (_) async {
                if (mounted) setState(() => _progress = 100);
                await _prepareWebExperience();
              },
              onWebResourceError: (error) {
                if (error.isForMainFrame == true && mounted) {
                  setState(() {
                    _pageFailed = true;
                    _progress = 100;
                  });
                }
              },
            ),
          );
    _controller = controller;
    unawaited(_configureAndroidFilePicker(controller));
    unawaited(controller.loadRequest(Uri.parse(_webUrl)));
  }

  Future<void> _configureAndroidFilePicker(WebViewController controller) async {
    if (!Platform.isAndroid) return;
    final platformController = controller.platform;
    if (platformController is AndroidWebViewController) {
      await platformController.setOnShowFileSelector(_selectWebFiles);
    }
  }

  Future<List<String>> _selectWebFiles(FileSelectorParams params) async {
    try {
      final acceptsImages =
          params.acceptTypes.isEmpty ||
          params.acceptTypes.any(
            (type) => type == 'image/*' || type.startsWith('image/'),
          );
      final result = await FilePicker.platform.pickFiles(
        type: acceptsImages ? FileType.image : FileType.any,
        allowMultiple: params.mode == FileSelectorMode.openMultiple,
        dialogTitle: acceptsImages ? 'Choose menu photo' : 'Choose file',
      );
      if (result == null) return const <String>[];

      return result.files
          .map((file) {
            final identifier = file.identifier;
            if (identifier != null && identifier.isNotEmpty) return identifier;
            final path = file.path;
            return path == null ? null : Uri.file(path).toString();
          })
          .whereType<String>()
          .toList(growable: false);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('The photo could not be opened. Please try again.'),
          ),
        );
      }
      return const <String>[];
    }
  }

  Future<void> _prepareWebExperience() async {
    await _controller.runJavaScript('''
      (() => {
        if (window.__devaAndroidPrepared) return;
        window.__devaAndroidPrepared = true;
        window.DevaDownloadCapabilities = Object.freeze({
          acknowledgements: true,
          savesToDownloads: true
        });
        document.addEventListener('click', (event) => {
          const link = event.target && event.target.closest
            ? event.target.closest('a[target="_blank"]')
            : null;
          if (link && link.href) {
            event.preventDefault();
            window.location.assign(link.href);
          }
        }, true);
      })();
    ''');
  }

  Future<void> _handleDownload(JavaScriptMessage message) async {
    String? requestId;
    try {
      final payload = jsonDecode(message.message) as Map<String, dynamic>;
      requestId = payload['requestId'] as String?;
      final fileName = safeDownloadName(payload['fileName'] as String?);
      final mimeType =
          payload['mimeType'] as String? ?? 'application/octet-stream';
      final bytes = decodeDownloadDataUrl(payload['dataUrl'] as String? ?? '');
      if (bytes.length > 50 * 1024 * 1024) {
        throw const FormatException('File is too large');
      }
      final savedLocation = await _downloadsChannel.invokeMethod<String>(
        'saveDownload',
        <String, Object>{
          'fileName': fileName,
          'mimeType': mimeType,
          'bytes': bytes,
        },
      );
      await _sendDownloadResult(
        requestId: requestId,
        ok: true,
        message: 'Saved to Downloads',
        location: savedLocation,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$fileName saved in Downloads/Deva'),
          action: SnackBarAction(
            label: 'Share',
            onPressed: () {
              _shareDownloadedFile(bytes, fileName, mimeType);
            },
          ),
        ),
      );
    } catch (error) {
      await _sendDownloadResult(
        requestId: requestId,
        ok: false,
        message: 'The file could not be saved. Please try again.',
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('The file could not be downloaded. Please try again.'),
        ),
      );
    }
  }

  Future<void> _sendDownloadResult({
    required String? requestId,
    required bool ok,
    required String message,
    String? location,
  }) async {
    if (requestId == null || requestId.isEmpty) return;
    final detail = jsonEncode(<String, Object?>{
      'requestId': requestId,
      'ok': ok,
      'message': message,
      'location': location,
    });
    try {
      await _controller.runJavaScript('''
        window.dispatchEvent(new CustomEvent('deva-download-result', {
          detail: $detail
        }));
      ''');
    } catch (_) {
      // The page may have navigated after requesting the download. The native
      // snackbar still reports the result to the user.
    }
  }

  Future<void> _shareDownloadedFile(
    Uint8List bytes,
    String fileName,
    String mimeType,
  ) async {
    try {
      final directory = await getTemporaryDirectory();
      final file = File('${directory.path}${Platform.pathSeparator}$fileName');
      await file.writeAsBytes(bytes, flush: true);
      if (!mounted) return;
      final box = context.findRenderObject() as RenderBox?;
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: mimeType)],
          title: fileName,
          sharePositionOrigin:
              box == null ? null : box.localToGlobal(Offset.zero) & box.size,
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('The saved file could not be shared.')),
      );
    }
  }

  Future<void> _retry() async {
    setState(() {
      _pageFailed = false;
      _progress = 0;
    });
    await _controller.loadRequest(Uri.parse(_webUrl));
  }

  Future<void> _handleBack() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return;
    }
    await SystemNavigator.pop();
  }

  @override
  Widget build(BuildContext context) {
    if (_pageFailed) {
      return Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const DevaMark(size: 64),
                  const SizedBox(height: 20),
                  const Text(
                    'Unable to open Deva',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Check your internet connection and try again.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey.shade700),
                  ),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    onPressed: _retry,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Try again'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _handleBack();
      },
      child: Scaffold(
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_progress < 100)
                Align(
                  alignment: Alignment.topCenter,
                  child: LinearProgressIndicator(
                    value: _progress == 0 ? null : _progress / 100,
                    minHeight: 3,
                    color: _orange,
                    backgroundColor: Colors.transparent,
                  ),
                ),
            ],
          ),
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
