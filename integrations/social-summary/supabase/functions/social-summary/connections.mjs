// Configuration readiness only. Never return env values or claim API validation.
export function connectionReadiness(get){
 const has=k=>Boolean(get(k));
 const youtubeOAuth=['YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET','YOUTUBE_REFRESH_TOKEN'].every(has);
 return {
  checked_at:new Date().toISOString(),
  verification:'configuration_presence_only',
  platforms:{
   youtube:{public_statistics:has('YOUTUBE_API_KEY')?'configured_unverified':'not_configured',private_analytics:['YT_ANALYTICS_CLIENT_ID','YT_ANALYTICS_CLIENT_SECRET','YT_ANALYTICS_REFRESH_TOKEN'].every(has)?'configured_see_youtube_analytics_status':youtubeOAuth?'authorization_scope_unverified':'oauth_not_configured'},
   instagram:{public_statistics:has('IG_ACCESS_TOKEN')&&has('IG_BUSINESS_ID')?'configured_unverified':'not_configured',private_analytics:'insights_permissions_unverified'},
   facebook:{public_statistics:has('FB_ACCESS_TOKEN')||has('IG_ACCESS_TOKEN')?'configured_unverified':'not_configured',private_analytics:'insights_permissions_unverified',page_token_configured:has('FB_PAGE_TOKEN'),page_token_used_by_current_sync:false},
   tiktok:{application:has('TIKTOK_CLIENT_KEY')&&has('TIKTOK_CLIENT_SECRET')?'configured_unverified':'not_configured',user_authorization:'not_checked',private_analytics:'not_integrated'},
   linkedin:{company_page:'https://www.linkedin.com/company/wonly-group/',page_source:'user_confirmed_2026-09-23',page_verification:'login_required_not_independently_verified',connector:'not_integrated',user_authorization:'not_checked',private_analytics:'not_integrated'}
  },
  limits:'仅服务端配置存在性核对，不代表Token有效、OAuth权限满足或后台数据已接通；不返回凭据。Facebook当前同步函数不读取FB_PAGE_TOKEN。TikTok用户授权存于源端，未在此读取。LinkedIn尚无连接器。禁止据此编造曝光、留存、受众或广告指标。'
 };
}
