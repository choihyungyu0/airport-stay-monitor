import 'leaflet/dist/leaflet.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { loadFonts } from './lib/fonts'
import './styles/app.css'

// 지도 첫 화면이 아니면 글꼴을 바로, 지도면 위성 타일이 다 뜬 뒤(타일이 안 오면 8초 뒤)
if (!/^#?(map)?$/.test(location.hash)) loadFonts()
setTimeout(loadFonts, 8000)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
