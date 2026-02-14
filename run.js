const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

// ==========================================
// [설정] 행님이 입력할 기본 정보 (기존과 동일)
// ==========================================
const TARGET_FOLDER = './docs'; 
const CLIENT_NAME = '주식회사준';          // 의뢰인 (채권자)
const OPPONENT_NAME = '세움엔키움주식회사';  // 상대방 (채무자)
const DEFAULT_CASE_NUM = ''; // 혹시 파일에서 사건번호 못 찾으면 이거 씀
// ==========================================

// 

async function processFiles() {
  try {
    const files = fs.readdirSync(TARGET_FOLDER).filter(file => file.toLowerCase().endsWith('.pdf'));

    if (files.length === 0) {
      console.log('❌ 처리할 PDF 파일이 없습니다 행님!');
      return;
    }

    console.log(`총 ${files.length}개의 파일을 처리합니다...`);

    for (const file of files) {
      const oldPath = path.join(TARGET_FOLDER, file);
      
      // 1. PDF 읽기
      const dataBuffer = fs.readFileSync(oldPath);
      const data = await pdf(dataBuffer);
      const text = data.text;

      // 2. 정보 추출 (스마트하게 진화함)
      const dateStr = extractDate(text);
      const title = extractTitle(text); 
      const author = extractAuthor(text);
      
      // [NEW] 사건번호 자동 추출 시도 (파일 안에 있으면 그걸 우선 사용)
      const extractedCaseNum = extractCaseNum(text);
      const finalCaseNum = extractedCaseNum || DEFAULT_CASE_NUM;

      // 3. 새 파일명 조합
      // 포맷: YYMMDD_제목(의뢰인vs상대방, 사건번호)_작성자.pdf
      
      // 사건번호가 있으면 콤마 찍고 넣기
      const casePart = finalCaseNum ? `, ${finalCaseNum}` : '';
      
      const newFileName = `${dateStr}_${title}(${CLIENT_NAME}vs${OPPONENT_NAME}${casePart})_${author}.pdf`;
      
      // 특수문자 제거 및 경로 설정
      const sanitizedFileName = newFileName.replace(/[\\/:*?"<>|]/g, ''); 
      const newPath = path.join(TARGET_FOLDER, sanitizedFileName);

      // 4. 이름 변경 실행
      if (oldPath !== newPath) {
        fs.renameSync(oldPath, newPath);
        console.log(`✅ 변경: ${file}`);
        console.log(`   -> ${sanitizedFileName}`);
      } else {
        console.log(`⏺️ 변경 없음: ${file}`);
      }
    }
    console.log('\n작업 끝났습니다 행님!');

  } catch (error) {
    console.error('⚠️ 에러 발생:', error);
  }
}

// ---------------------------------------------------
// [로직 1] 날짜 추출 (기존 유지 + 법원문서 하단 날짜 대응)
// ---------------------------------------------------
function extractDate(text) {
  // 1순위: 문서 내용 중 2026. 2. 10. 같은 패턴 찾기
  const dateRegex = /(\d{4})[.년]\s*(\d{1,2})[.월]\s*(\d{1,2})[.일]?/;
  const match = text.match(dateRegex);

  if (match) {
    const year = match[1].slice(2, 4); 
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    return `${year}${month}${day}`;
  }
  
  // 못 찾으면 오늘 날짜
  const today = new Date();
  const yy = String(today.getFullYear()).slice(2);
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

// ---------------------------------------------------
// [로직 2] 제목 추출 (결정, 판결 추가됨)
// ---------------------------------------------------
function extractTitle(text) {
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // 페이지 번호 제거
  const cleanLines = lines.filter(line => !/^[-_=\[\]\s]*\d+[-_=\[\]\s]*$/.test(line));

  if (cleanLines.length === 0) return '제목없음';

  // [NEW] 법원 결정문/판결문용 짧은 제목 우선 검색
  // "결 정", "판 결", "명 령" 처럼 띄어쓰기 된 경우가 많음
  const courtTitles = ['결정', '판결', '명령', '이행권고결정', '화해권고결정'];
  
  // 상단 10줄 이내에서 법원 제목 찾기
  for (let i = 0; i < Math.min(cleanLines.length, 10); i++) {
    const line = cleanLines[i].replace(/\s/g, ''); // 띄어쓰기 제거하고 비교 ("결 정" -> "결정")
    if (courtTitles.includes(line)) {
      return line; // "결정" 리턴
    }
  }

  // [기존] 변호사 서면 키워드 검색
  const keywords = ['소장', '답변서', '준비서면', '신청서', '청구취지', '변경신청', '항소장', '상고장', '가압류'];
  for (let i = 0; i < Math.min(cleanLines.length, 5); i++) {
    const line = cleanLines[i];
    if (keywords.some(k => line.includes(k)) && line.length < 30) {
      return line.replace(/\s+/g, '');
    }
  }

  return cleanLines[0].substring(0, 20).replace(/\s+/g, '');
}

// ---------------------------------------------------
// [로직 3] 작성자 추출 (법원 감지 기능 추가)
// ---------------------------------------------------
function extractAuthor(text) {
  const tailText = text.slice(-1000); 

  // [NEW] 1순위: 법원 이름이 있는지 확인 (문서 맨 끝에 보통 있음)
  // 예: "수원지방법원", "서울고등법원", "부산가정법원"
  const courtMatch = tailText.match(/([가-힣]+(지방|고등|가정|행정|회생)법원[가-힣]*지원?)/);
  if (courtMatch) {
    return courtMatch[1]; // "수원지방법원" 리턴
  }

  // 2순위: "법무법인" (기존 로직)
  const firmMatch = tailText.match(/법무법인\s*([가-힣]+)/);
  if (firmMatch) {
    return `법무법인${firmMatch[1]}`;
  }

  // 3순위: "변호사" (기존 로직)
  const lawyerMatch = tailText.match(/변호사\s*([가-힣]{2,4})/);
  if (lawyerMatch) {
    return lawyerMatch[1];
  }

  return '작성자미상';
}

// ---------------------------------------------------
// [NEW 로직 4] 사건번호 자동 추출
// ---------------------------------------------------
function extractCaseNum(text) {
  // 패턴: 2026카단500796, 2024가합1234
  // 연도(4자리) + 한글(1~3자) + 숫자
  const caseRegex = /(\d{4})([가-힣]{1,3})(\d+)/;
  
  // 문서 전체가 아니라 앞부분 500자 안에서만 찾음 (사건번호는 보통 위에 있으니까)
  const headText = text.slice(0, 500);
  const match = headText.match(caseRegex);

  if (match) {
    return match[0]; // "2026카단500796" 전체 반환
  }
  return null; // 없으면 null
}

// 실행
processFiles();