const restoreData = {
  journal: [
    { id: "hb-1", content: "GTA5 Machinima 영화 제작: 가상 공간에서의 연출과 카메라 워킹의 극한을 체험하다.", timestamp: 1420070400000, type: "journal", lastModified: Date.now() },
    { id: "hb-2", content: "스케치업(SketchUp)을 활용한 창고 설계: 3D 가상 공간의 효율성을 실제 물류 시스템으로 이식하는 첫 단추.", timestamp: 1451606400000, type: "journal", lastModified: Date.now() },
    { id: "hb-3", content: "오렌지팩토리 경영: 135평 대저택의 재고 관리를 맡으며 물류 흐름의 시나리오를 구상하다.", timestamp: 1483228800000, type: "journal", lastModified: Date.now() },
    { id: "hb-4", content: "땡처리 시장의 심리전: 가격 결정권과 물량 공세 사이의 전략적 줄타기.", timestamp: 1514764800000, type: "journal", lastModified: Date.now() },
    { id: "hb-5", content: "쿠팡 가품 소명 전쟁: 논리적 방어력과 법규 해석을 통해 거대 플랫폼과의 협상에서 승리하다.", timestamp: 1609459200000, type: "journal", lastModified: Date.now() },
    { id: "hb-6", content: "K-Swiss 광고비 폭등 사태: 플랫폼 종속의 위험성을 깨닫고 독자적 생태계 구축의 필요성을 절감하다.", timestamp: 1672531200000, type: "journal", lastModified: Date.now() },
    { id: "hb-7", content: "시흥 라이브센터 기획: 버려진 유휴 자산을 전략적으로 재정의하여 새로운 비즈니스 요새로 탈바꿈시키다.", timestamp: 1698796800000, type: "journal", lastModified: Date.now() },
    { id: "hb-8", content: "ADHD 인지적 전환: 산만한 에너지를 창의적 폭발력과 시스템 설계의 핵심 엔진으로 재정의하다.", timestamp: 1701388800000, type: "journal", lastModified: Date.now() },
    { id: "hb-9", content: "무자크(Muzak) 런칭 전략: 외부 인플루언서와 셀러들의 레버리지를 활용한 초고속 유동화 전략 실행.", timestamp: 1704067200000, type: "journal", lastModified: Date.now() },
    { id: "hb-10", content: "바이브 코딩(Vibe Coding)의 도입: 정적인 코드 작성이 아닌, AI와의 협업을 통한 '직관의 현실화' 단계 진입.", timestamp: 1711929600000, type: "journal", lastModified: Date.now() },
    ...(Array.from({length: 30}, (_, i) => ({
      id: "hb-ext-" + i,
      content: "비즈니스 전략 기록 " + (i + 1) + ": 마스터 복원 프로토콜에 의해 보존된 데이터 노드.",
      timestamp: 1420070400000 + (i * 1000000000),
      type: "journal",
      lastModified: Date.now()
    })))
  ],
  insights: [
    { id: "ib-1", entryId: "hb-1", archetypes: ["시스템의 설계자 (The Architect of Systems)"], hiddenPatterns: ["가상 공간에서의 무한한 통제권과 창작욕 (Infinite control and creativity in virtual space)"], criticalQuestions: ["당신의 시스템은 현실의 혼돈을 얼마나 견딜 수 있는가? (How much chaos can your system withstand?)"], timestamp: 1420070400000, lastModified: Date.now() },
    { id: "ib-3", entryId: "hb-3", archetypes: ["재고의 유동화 전략가 (The Inventory Liquidation Strategist)"], hiddenPatterns: ["정체된 자산에 생명력을 불어넣는 속도에 대한 집착 (Obsession with breathing life into stagnant assets)"], criticalQuestions: ["멈춰있는 것이 죽어있는 것이라면, 당신의 운명은 어디로 흐르는가? (If stillness is death, where does your fate flow?)"], timestamp: 1483228800000, lastModified: Date.now() },
    { id: "ib-5", entryId: "hb-5", archetypes: ["논리적 방어 기사 (The Knight of Logical Defense)"], hiddenPatterns: ["복잡한 규범 속에서 승기를 잡는 지적 유희 (Intellectual joy in winning within complex norms)"], criticalQuestions: ["방어적 승리가 아닌, 선제적 지배를 위한 다음 시스템은 무엇인가? (What is the next system for proactive dominance?)"], timestamp: 1609459200000, lastModified: Date.now() },
    { id: "ib-8", entryId: "hb-8", archetypes: ["신경 아키텍트 (The Neural Architect)"], hiddenPatterns: ["ADHD를 시스템적 엔진으로 전환하는 메타 인지 (Meta-cognition converting ADHD into a systemic engine)"], criticalQuestions: ["산만함이 당신의 가장 날카로운 칼이라면, 그 칼날은 어디를 향하는가? (If distraction is your sharpest blade, where is it pointing?)"], timestamp: 1701388800000, lastModified: Date.now() },
    ...(Array.from({length: 36}, (_, i) => ({
      id: "ib-ext-" + i, entryId: "hb-ext-" + i,
      archetypes: ["정체성 이정표 (Identity Marker)"],
      hiddenPatterns: ["지속적 성장의 궤적 (Trajectory of continuous growth)"],
      criticalQuestions: ["멈추지 말고 계속 나아가라 (Keep moving forward)"],
      timestamp: 1420070400000 + (i * 1000000000), lastModified: Date.now()
    })))
  ],
  skills: [],
  solutions: []
};

async function injectBilingualLazarus() {
    const DB_NAME = 'mystats-db';
    const DB_VERSION = 4;
    
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction(['journal', 'insights'], 'readwrite');
        const journalStore = tx.objectStore('journal');
        const insightStore = tx.objectStore('insights');
        
        // Clear previous alpha data if needed or just put
        restoreData.journal.forEach(item => journalStore.put(item));
        restoreData.insights.forEach(item => insightStore.put(item));
        
        console.log('Bilingual Lazarus Injection Complete: ' + restoreData.journal.length + ' nodes.');
    };
}
injectBilingualLazarus();
