# 연금 수령액 계산기

국민연금·퇴직연금(DC)·개인연금의 은퇴 후 월 수령액을 세전·세후로 계산하는 정적 웹앱.
계산은 모두 브라우저에서 이뤄지며 서버가 없다.

- 계산 명세: [docs/SPEC.md](docs/SPEC.md)
- 세법·제도 기준값: [src/engine/params.ts](src/engine/params.ts) (매년 1회 갱신)
- 계산 엔진: [src/engine](src/engine) — UI와 분리된 순수 함수

```bash
npm install
npm run dev     # 개발 서버
npm test        # 계산 엔진 테스트
npm run build   # dist/ 에 정적 파일 생성
```

배포: GitHub 저장소를 Vercel에 연결하면 설정 없이 배포된다(Framework: Vite, Output: `dist`).
