interface ImportMetaEnv {
  /** 국토교통부 브이월드 WMTS 인증키. 없으면 배경 없음으로만 동작(ST-08). */
  readonly VITE_VWORLD_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
