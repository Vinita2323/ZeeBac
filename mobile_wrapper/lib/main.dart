import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'native/native_auth_bridge.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Set system UI style (transparent status bar, dark icons)
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      statusBarBrightness: Brightness.light,
    ),
  );

  runApp(const ZeeBacApp());
}

class ZeeBacApp extends StatelessWidget {
  const ZeeBacApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ZeeBac',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2563EB)),
        useMaterial3: true,
        scaffoldBackgroundColor: Colors.white,
      ),
      home: const ZeeBacWebViewScreen(),
    );
  }
}

class ZeeBacWebViewScreen extends StatefulWidget {
  const ZeeBacWebViewScreen({super.key});

  @override
  State<ZeeBacWebViewScreen> createState() => _ZeeBacWebViewScreenState();
}

class _ZeeBacWebViewScreenState extends State<ZeeBacWebViewScreen>
    with WidgetsBindingObserver {
  InAppWebViewController? _webViewController;
  double _progress = 0;
  DateTime? _lastPausedTime;

  // Lock grace period matches existing Zeebac web policy (10 minutes)
  static const Duration _lockGracePeriod = Duration(minutes: 10);

  // App URL: can be overridden via dart-define or default to production/local
  final String _initialUrl = const String.fromEnvironment(
    'ZEEBAC_URL',
    defaultValue: 'https://zeebac.com',
  );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);

    if (state == AppLifecycleState.paused) {
      _lastPausedTime = DateTime.now();
    } else if (state == AppLifecycleState.resumed) {
      if (_lastPausedTime != null) {
        final elapsed = DateTime.now().difference(_lastPausedTime!);
        if (elapsed >= _lockGracePeriod) {
          // Notify the web application to engage the AppLockScreen immediately
          NativeAuthBridge.instance.notifyWeb('native:lockApp', {
            'elapsedSeconds': elapsed.inSeconds,
            'reason': 'background_timeout',
          });
        }
      }
      _lastPausedTime = null;
    }
  }

  Future<bool> _handleWillPop() async {
    if (_webViewController != null && await _webViewController!.canGoBack()) {
      await _webViewController!.goBack();
      return false;
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: _handleWillPop,
      child: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: Stack(
            children: [
              InAppWebView(
                initialUrlRequest: URLRequest(
                  url: WebUri(_initialUrl),
                ),
                initialSettings: InAppWebViewSettings(
                  useShouldOverrideUrlLoading: true,
                  mediaPlaybackRequiresUserGesture: false,
                  allowsInlineMediaPlayback: true,
                  javaScriptEnabled: true,
                  javaScriptCanOpenWindowsAutomatically: true,
                  domStorageEnabled: true,
                  databaseEnabled: true,
                  cacheEnabled: true,
                  supportMultipleWindows: false,
                  useHybridComposition: true,
                ),
                onWebViewCreated: (controller) {
                  _webViewController = controller;
                  NativeAuthBridge.instance.attachWebView(controller);
                },
                onProgressChanged: (controller, progress) {
                  setState(() {
                    _progress = progress / 100;
                  });
                },
              ),
              if (_progress < 1.0)
                LinearProgressIndicator(
                  value: _progress,
                  backgroundColor: Colors.transparent,
                  valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF2563EB)),
                  minHeight: 2.5,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
