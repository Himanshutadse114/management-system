import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:webview_flutter/webview_flutter.dart';

const _orange = Color(0xFFF58220);
const _ink = Color(0xFF171B18);
const _surface = Color(0xFFF7F5F0);

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
    _controller =
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
          )
          ..loadRequest(Uri.parse(_webUrl));
  }

  Future<void> _prepareWebExperience() async {
    await _controller.runJavaScript('''
      (() => {
        if (window.__devaAndroidPrepared) return;
        window.__devaAndroidPrepared = true;
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
    try {
      final payload = jsonDecode(message.message) as Map<String, dynamic>;
      final rawName = (payload['fileName'] as String? ?? 'deva-download')
          .replaceAll(RegExp(r'[^A-Za-z0-9._ -]'), '_');
      final fileName = rawName.isEmpty ? 'deva-download' : rawName;
      final dataUrl = payload['dataUrl'] as String? ?? '';
      final separator = dataUrl.indexOf(',');
      if (separator < 0) throw const FormatException('Missing file content');
      final bytes = base64Decode(dataUrl.substring(separator + 1));
      if (bytes.length > 50 * 1024 * 1024) {
        throw const FormatException('File is too large');
      }
      final directory = await getTemporaryDirectory();
      final file = File('${directory.path}${Platform.pathSeparator}$fileName');
      await file.writeAsBytes(bytes, flush: true);
      if (!mounted) return;
      final box = context.findRenderObject() as RenderBox?;
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: payload['mimeType'] as String?)],
          title: fileName,
          sharePositionOrigin:
              box == null ? null : box.localToGlobal(Offset.zero) & box.size,
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('The file could not be downloaded. Please try again.'),
        ),
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
