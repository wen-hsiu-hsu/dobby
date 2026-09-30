/**
 * Flex 卡片用的圖片資產設定。實際檔案放在 assets/flex/，由
 * `.github/workflows/pages.yml` 發布到 GitHub Pages
 * （https://wen-hsiu-hsu.github.io/dobby/flex/<檔名>），LINE 用戶端才抓得到——
 * LINE 的 Flex image/hero url 必須是外部可存取的 HTTPS 網址，這個服務本身沒有
 * 對外提供靜態檔案的路由。
 *
 * 刻意不當環境變數：這是固定的靜態資源位置，不會因部署環境（本機／正式）而
 * 異，加進 `env.ts` 的 zod schema 只是多一道不必要的設定門檻。
 */
export const FLEX_ASSET_ROOT = 'https://wen-hsiu-hsu.github.io/dobby/flex/';

/** assets/flex/ 底下的檔名，所有 Flex 卡片（狀態卡、指令清單卡、名單卡）組裝時取用。 */
export const FLEX_ICONS = {
  headerShuttle: 'header-shuttle.jpg',
  checkDark: 'check-dark.png',
  calendarCheckDark: 'calendar-check-dark.png',
  calendarXDark: 'calendar-x-dark.png',
  banDark: 'ban-dark.png',
  minusWhite: 'minus-white.png',
  infoWhite: 'info-white.png',
  usersGray: 'users-gray.png',
  calendarXGray: 'calendar-x-gray.png',
  userCheckGray: 'user-check-gray.png',
  // 指令清單卡
  listDark: 'list-dark.png',
  searchGray: 'search-gray.png',
  calendarGray: 'calendar-gray.png',
  shieldGray: 'shield-gray.png',
  userPlusGray: 'user-plus-gray.png',
  usersLight: 'users-light.png',
  megaphoneLight: 'megaphone-light.png',
  creditCardLight: 'credit-card-light.png',
  circleDollarSignLight: 'circle-dollar-sign-light.png',
  calendarCheckLight: 'calendar-check-light.png',
  fileTextLight: 'file-text-light.png',
  chevronRightDim: 'chevron-right-dim.png',
  // 名單卡
  circleDollarSignDark: 'circle-dollar-sign-dark.png',
  usersDark: 'users-dark.png',
  userXWhite: 'user-x-white.png',
} as const;

export function flexAssetUrl(filename: string): string {
  return `${FLEX_ASSET_ROOT}${filename}`;
}
