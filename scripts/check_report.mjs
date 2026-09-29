// 배포 전 관문(OPS-01): 산출 JSON이 모두 있고 검증 리포트에 실패가 없어야 빌드를 이어 간다.
// Vercel 빌드도 npm run build를 타므로 여기서 멈추면 배포가 중단된다.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../public/data/', import.meta.url))
const files = ['indicators.json', 'sgg.json', 'boundary_43.geojson', 'meta.json']
const problems = []

for (const f of files) {
  if (!existsSync(dir + f)) problems.push(`${f} 없음 → npm run build:data`)
}

if (!problems.length) {
  const meta = JSON.parse(readFileSync(dir + 'meta.json', 'utf8'))
  const ind = JSON.parse(readFileSync(dir + 'indicators.json', 'utf8'))
  const failed = (meta.report?.checks ?? []).filter((c) => c.status === 'fail')
  for (const c of failed) problems.push(`[${c.id}] ${c.name}: ${c.detail}`)
  if (!meta.asof?.arrivals_latest) problems.push('meta.asof 기준 시점 누락')
  if (!ind.airports?.length) problems.push('indicators.json 공항 없음')
  const warns = (meta.report?.checks ?? []).filter((c) => c.status === 'warn')
  for (const c of warns) console.warn(`경고 [${c.id}] ${c.name}: ${c.detail}`)
}

if (problems.length) {
  console.error('검증 실패로 배포를 멈춥니다.\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log(`검증 리포트 통과 · 입국 ${JSON.parse(readFileSync(dir + 'meta.json', 'utf8')).asof.arrivals_latest}까지`)
