// ここに置けるのは公開情報だけです。LINE Channel Secretやservice_role keyは禁止です。
window.SAKAI_CONFIG = Object.freeze({
  liffId: "YOUR_LIFF_ID",
  lineAuthEndpoint: "YOUR_HTTPS_API_BASE_URL/auth/line/exchange",
  lineLinkEndpoint: "YOUR_HTTPS_API_BASE_URL/auth/line/link",
  absenceSubmitEndpoint: "YOUR_HTTPS_API_BASE_URL/functions/v1/submit-absence",
  supabaseUrl: "YOUR_SUPABASE_PROJECT_URL",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY"
});
