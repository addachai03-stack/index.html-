package com.cutnova.android;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.DownloadListener;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
  private static final String HOME="https://addachai03-stack.github.io/index.html-/#local-editor";
  private static final String HOST="addachai03-stack.github.io";
  private static final int PICK_FILE=117;
  private WebView browser;
  private WebChromeClient.FileChooserParams filePicker;
  private android.webkit.ValueCallback<Uri[]> selectedFiles;
  private ProgressBar loading;
  private TextView headline;
  private boolean loadFailed=false;

  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    getWindow().setStatusBarColor(Color.rgb(12,13,17));
    getWindow().setNavigationBarColor(Color.rgb(12,13,17));
    getWindow().getDecorView().setSystemUiVisibility(0);
    WebView.setWebContentsDebuggingEnabled(false);

    LinearLayout root=new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(Color.rgb(12,13,17));
    root.setOnApplyWindowInsetsListener((view,insets)->{
      root.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());
      return insets;
    });

    LinearLayout bar=new LinearLayout(this);
    bar.setOrientation(LinearLayout.HORIZONTAL);
    bar.setGravity(android.view.Gravity.CENTER_VERTICAL);
    bar.setPadding(dp(12),0,dp(8),0);
    TextView title=new TextView(this);
    title.setText("✂ CUTNOVA");
    title.setTextSize(18);
    title.setTextColor(Color.rgb(201,246,93));
    title.setTypeface(null,1);
    bar.addView(title,new LinearLayout.LayoutParams(0,dp(49),1));
    title.setGravity(android.view.Gravity.CENTER_VERTICAL);

    Button reload=new Button(this);
    reload.setText("⟳");
    reload.setContentDescription("Reload CutNova");
    bar.addView(reload,new LinearLayout.LayoutParams(dp(48),dp(48)));
    Button chrome=new Button(this);
    chrome.setText("CHROME");
    chrome.setTextSize(11);
    chrome.setContentDescription("Open CutNova in external browser for full editing compatibility");
    bar.addView(chrome,new LinearLayout.LayoutParams(dp(99),dp(48)));
    root.addView(bar);

    loading=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
    loading.setMax(100);
    loading.setProgressTintList(android.content.res.ColorStateList.valueOf(Color.rgb(201,246,93)));
    root.addView(loading,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,dp(3)));

    headline=new TextView(this);
    headline.setTextColor(Color.rgb(201,246,93));
    headline.setTextSize(12);
    headline.setPadding(dp(12),dp(5),dp(12),dp(5));
    headline.setVisibility(View.GONE);
    root.addView(headline);

    browser=new WebView(this);
    browser.setBackgroundColor(Color.WHITE);
    browser.setWebViewClient(new WebViewClient(){
      @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap favicon){
        loadFailed=false;headline.setVisibility(View.GONE);
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
        if(!request.isForMainFrame()) return false;
        Uri uri=request.getUrl();
        if("https".equals(uri.getScheme())&&HOST.equals(uri.getHost())&&
           (uri.getPath()==null||uri.getPath().startsWith("/index.html-")))return false;
        openExternal(uri);
        return true;
      }
      @Override public void onReceivedError(WebView view,WebResourceRequest req,WebResourceError error){
        if(req.isForMainFrame()){
          loadFailed=true;
          headline.setVisibility(View.VISIBLE);
          headline.setText("Cannot load. Check internet, then tap ⟳ or CHROME.");
        }
      }
      @Override public void onPageFinished(WebView view,String url){
        loading.setVisibility(View.GONE);
      }
    });
    WebSettings settings=browser.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setMediaPlaybackRequiresUserGesture(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(true);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setLoadsImagesAutomatically(true);
    settings.setCacheMode(WebSettings.LOAD_DEFAULT);
    settings.setSupportMultipleWindows(false);
    if(android.os.Build.VERSION.SDK_INT>=26)settings.setSafeBrowsingEnabled(true);

    browser.setWebChromeClient(new WebChromeClient(){
      @Override public void onProgressChanged(WebView view,int progress){
        loading.setVisibility(progress<100?View.VISIBLE:View.GONE);
        loading.setProgress(progress);
        if(progress>=100&&!loadFailed)headline.setVisibility(View.GONE);
      }
      @Override public boolean onShowFileChooser(WebView view,
        android.webkit.ValueCallback<Uri[]> callback,FileChooserParams params){
        if(selectedFiles!=null) selectedFiles.onReceiveValue(null);
        selectedFiles=callback;
        filePicker=params;
        try{
          Intent intent=params.createIntent();
          startActivityForResult(intent,PICK_FILE);
          return true;
        }catch(Exception e){
          selectedFiles.onReceiveValue(null);
          selectedFiles=null;
          Toast.makeText(MainActivity.this,"Open the same page in Chrome to choose videos.",Toast.LENGTH_LONG).show();
          return false;
        }
      }
    });
    browser.setDownloadListener((url,userAgent,disposition,mime,length)->{
      if(url!=null&&url.startsWith("blob:")){
        Toast.makeText(this,"For video export downloads use the CHROME button above.",Toast.LENGTH_LONG).show();
        return;
      }
      if(url!=null&&(url.startsWith("https://")||url.startsWith("http://")))openExternal(Uri.parse(url));
    });
    root.addView(browser,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1));
    setContentView(root);

    reload.setOnClickListener(v->{
      headline.setVisibility(View.GONE);
      browser.loadUrl(HOME);
    });
    chrome.setOnClickListener(v->openExternal(Uri.parse(HOME)));
    browser.loadUrl(HOME);
  }

  private int dp(int number){return Math.round(number*getResources().getDisplayMetrics().density);}
  private void openExternal(Uri uri){
    try{
      if(!"https".equals(uri.getScheme())&&!"http".equals(uri.getScheme()))return;
      Intent intent=new Intent(Intent.ACTION_VIEW,uri);
      intent.addCategory(Intent.CATEGORY_BROWSABLE);
      startActivity(intent);
    }catch(ActivityNotFoundException e){
      Toast.makeText(this,"No browser installed. Use the app screen.",Toast.LENGTH_LONG).show();
    }
  }
  @Override protected void onActivityResult(int req,int result,Intent data){
    super.onActivityResult(req,result,data);
    if(req==PICK_FILE){
      if(selectedFiles!=null)selectedFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));
      selectedFiles=null;filePicker=null;
    }
  }
  @Override public void onBackPressed(){
    if(browser!=null&&browser.canGoBack())browser.goBack();
    else super.onBackPressed();
  }
  @Override protected void onDestroy(){
    if(selectedFiles!=null){selectedFiles.onReceiveValue(null);selectedFiles=null;}
    if(browser!=null){browser.stopLoading();browser.destroy();browser=null;}
    super.onDestroy();
  }
}
