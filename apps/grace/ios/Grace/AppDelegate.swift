import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = GraceViewController()
        window?.makeKeyAndVisible()
        return true
    }
}

final class GraceViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let home = URL(string: "https://crm.foreverdoodle.com/?app=grace")!
    private var web: WKWebView!
    private let retry = UIButton(type: .system)
    private let privacy = UIView()
    private func trusted(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == "https" && url.host == "crm.foreverdoodle.com" && (url.port == nil || url.port == 443) && url.user == nil && url.password == nil
    }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.133, green: 0.137, blue: 0.129, alpha: 1)
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        // Session-only WebKit storage avoids a persistent customer cache on shared devices.
        config.websiteDataStore = .nonPersistent()
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self; web.uiDelegate = self
        web.isOpaque = false; web.backgroundColor = view.backgroundColor
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),web.leadingAnchor.constraint(equalTo: view.leadingAnchor),web.trailingAnchor.constraint(equalTo: view.trailingAnchor)])
        retry.setTitle("无法连接 Grace · 点击重试", for: .normal)
        retry.addTarget(self, action: #selector(reload), for: .touchUpInside)
        retry.backgroundColor = view.backgroundColor; retry.isHidden = true
        retry.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(retry)
        NSLayoutConstraint.activate([retry.centerXAnchor.constraint(equalTo: view.centerXAnchor),retry.centerYAnchor.constraint(equalTo: view.centerYAnchor),retry.heightAnchor.constraint(equalToConstant: 60)])
        privacy.backgroundColor = view.backgroundColor; privacy.frame = view.bounds; privacy.autoresizingMask = [.flexibleWidth,.flexibleHeight]; privacy.isHidden = true; view.addSubview(privacy)
        NotificationCenter.default.addObserver(self, selector: #selector(background), name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(foreground), name: UIApplication.didBecomeActiveNotification, object: nil)
        reload()
    }
    @objc private func reload() { retry.isHidden = true; web.load(URLRequest(url: home, cachePolicy: .reloadIgnoringLocalCacheData)) }
    @objc private func background() {
        privacy.isHidden = false
        web.evaluateJavaScript("document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide'))", completionHandler: nil)
        web.setMicrophoneCaptureState(.none, completionHandler: nil)
        web.pauseAllMediaPlayback(completionHandler: nil)
    }
    @objc private func foreground() { privacy.isHidden = true }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { retry.isHidden = true }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { if (error as NSError).code != NSURLErrorCancelled { retry.isHidden = false } }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { retry.isHidden = false }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if navigationAction.targetFrame?.isMainFrame == false {
            // Existing signed material POSTs stay inside their sandboxed document frame.
            decisionHandler(url.scheme == "https" || url.scheme == "blob" || url.absoluteString == "about:blank" ? .allow : .cancel); return
        }
        if trusted(url) { decisionHandler(.allow); return }
        if navigationAction.navigationType == .linkActivated && url.scheme == "https" && url.user == nil && url.password == nil { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, navigationAction.navigationType == .linkActivated, url.scheme == "https", url.user == nil, url.password == nil { UIApplication.shared.open(url) }
        return nil
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(type == .microphone && origin.protocol == "https" && origin.host == "crm.foreverdoodle.com" && (origin.port == 0 || origin.port == 443) && frame.isMainFrame && trusted(webView.url) ? .prompt : .deny)
    }
}
