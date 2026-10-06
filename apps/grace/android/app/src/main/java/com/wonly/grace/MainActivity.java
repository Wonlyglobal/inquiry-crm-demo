package com.wonly.grace;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.*;
import android.view.WindowManager;
import android.widget.*;

public final class MainActivity extends Activity {
    private static final String HOME = "https://crm.foreverdoodle.com/?app=grace";
    private WebView web;
    private PermissionRequest pending;
    private Button retry;
    private boolean foreground;
    private static boolean trusted(Uri url) {
        return url != null && "https".equals(url.getScheme()) && "crm.foreverdoodle.com".equals(url.getHost()) && (url.getPort() == -1 || url.getPort() == 443) && url.getUserInfo() == null;
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setBackgroundColor(Color.rgb(34,35,33));
        layout.setOnApplyWindowInsetsListener((v,insets)->{ v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets(); });
        retry = new Button(this);retry.setText("无法连接 Grace · 点击重试");retry.setVisibility(android.view.View.GONE);retry.setOnClickListener(v->{retry.setVisibility(android.view.View.GONE);web.loadUrl(HOME);});layout.addView(retry);
        web = new WebView(this);layout.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(layout);
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);settings.setMediaPlaybackRequiresUserGesture(false);settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                Uri url=request.getUrl();if(!request.isForMainFrame())return !("https".equals(url.getScheme())||"blob".equals(url.getScheme())||"about:blank".equals(url.toString()));
                if(trusted(url))return false;
                if(request.hasGesture()&&"https".equals(url.getScheme())&&url.getUserInfo()==null){try{startActivity(new Intent(Intent.ACTION_VIEW,url));}catch(android.content.ActivityNotFoundException ignored){Toast.makeText(MainActivity.this,"未找到可打开链接的浏览器",Toast.LENGTH_SHORT).show();}}
                return true;
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest req,WebResourceError error){if(req.isForMainFrame())retry.setVisibility(android.view.View.VISIBLE);}
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest req,WebResourceResponse response){if(req.isForMainFrame())retry.setVisibility(android.view.View.VISIBLE);}
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){recreate();return true;}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onPermissionRequest(PermissionRequest request){runOnUiThread(()->{
                if(!foreground||!trusted(request.getOrigin())||!trusted(Uri.parse(web.getUrl()==null?"":web.getUrl()))||request.getResources().length!=1||!PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(request.getResources()[0])){request.deny();return;}
                if(pending!=null)pending.deny();pending=request;
                if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED){pending.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});pending=null;}
                else requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},10);
            });}
            @Override public void onPermissionRequestCanceled(PermissionRequest request){if(pending==request)pending=null;}
        });
        // No JavaScript/native bridge and no bundled service credentials.
        web.loadUrl(HOME);
    }
    @Override public void onRequestPermissionsResult(int code,String[] names,int[] results){super.onRequestPermissionsResult(code,names,results);if(code==10&&pending!=null){if(foreground&&results.length==1&&results[0]==PackageManager.PERMISSION_GRANTED&&trusted(Uri.parse(web.getUrl()==null?"":web.getUrl())))pending.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});else pending.deny();pending=null;}}
    @Override protected void onPause(){foreground=false;if(pending!=null){pending.deny();pending=null;}web.evaluateJavascript("window.dispatchEvent(new Event('pagehide'))",null);web.onPause();super.onPause();}
    @Override protected void onResume(){super.onResume();foreground=true;if(web!=null)web.onResume();}
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){if(web!=null){web.clearCache(true);web.destroy();}super.onDestroy();}
}
