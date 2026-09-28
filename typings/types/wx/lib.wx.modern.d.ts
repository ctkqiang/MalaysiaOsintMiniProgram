// 新版基础库 API 的类型补充（vendored typings 停留在 2.8.x，缺少 2.20+ 接口）
// 通过命名空间合并声明，不修改 Tencent 原版类型文件。
// 注：onThemeChange / requestSubscribeMessage 旧库已含，此处不重复声明。
declare namespace WechatMiniprogram {
  interface WindowManagerInfo2 {
    statusBarHeight: number
    safeArea: SafeArea
    windowWidth: number
    windowHeight: number
    pixelRatio: number
  }
  interface AppBaseInfo2 {
    theme?: 'dark' | 'light'
    language: string
    version: string
  }
  interface Wx {
    /** 基础库 2.20.1+ 窗口信息 */
    getWindowInfo(): WindowManagerInfo2
    /** 基础库 2.20.1+ 客户端基础信息（含深浅色 theme） */
    getAppBaseInfo(): AppBaseInfo2
  }
}
