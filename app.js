/* ==========================================================================
   교실 발표자 추첨 & 발표 타이머 애플리케이션 로직 (app.js)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // ------------------------------------------------------------------------
  // 1. 상태 변수 및 DOM 요소 참조
  // ------------------------------------------------------------------------
  let roster = [];           // 전체 학생 명단
  let drawnSet = new Set();  // 이미 뽑힌 학생 목록
  let isRolling = false;     // 추첨 애니메이션 동작 여부

  let timerDuration = 180;   // 타이머 설정 시간 (초) - 기본 3분
  let timerRemaining = 180;  // 타이머 남은 시간 (초)
  let timerInterval = null;  // 타이머 인터벌 ID
  let isTimerRunning = false;// 타이머 작동 여부

  // Web Audio Context (사운드 생성용)
  let audioCtx = null;

  // DOM Elements
  const rosterInput = document.getElementById('rosterInput');
  const totalCountEl = document.getElementById('totalCount');
  const availableCountEl = document.getElementById('availableCount');
  const presetNumbersBtn = document.getElementById('presetNumbersBtn');
  const presetSampleBtn = document.getElementById('presetSampleBtn');
  const clearRosterBtn = document.getElementById('clearRosterBtn');

  const excludeDrawnCheck = document.getElementById('excludeDrawnCheck');
  const rollingBox = document.getElementById('rollingBox');
  const drawBtn = document.getElementById('drawBtn');
  const resetDrawnBtn = document.getElementById('resetDrawnBtn');
  const drawnCountEl = document.getElementById('drawnCount');
  const drawnTagsEl = document.getElementById('drawnTags');

  const timerDisplay = document.getElementById('timerDisplay');
  const timerProgress = document.getElementById('timerProgress');
  const timerStateBadge = document.getElementById('timerStateBadge');
  const startTimerBtn = document.getElementById('startTimerBtn');
  const pauseTimerBtn = document.getElementById('pauseTimerBtn');
  const resetTimerBtn = document.getElementById('resetTimerBtn');
  const presetBtns = document.querySelectorAll('.btn-preset');

  const resultModal = document.getElementById('resultModal');
  const winnerNameDisplay = document.getElementById('winnerNameDisplay');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const confettiCanvas = document.getElementById('confettiCanvas');

  // ------------------------------------------------------------------------
  // 2. Web Audio API 오디오 헬퍼 (틱 소리 & 타이머 알람)
  // ------------------------------------------------------------------------
  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // 롤링 시 틱 소리
  function playTickSound() {
    initAudio();
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.03);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.03);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.03);
    } catch (e) {
      console.error(e);
    }
  }

  // 당첨 축하 팡파르 sound
  function playFanfareSound() {
    initAudio();
    if (!audioCtx) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const startTime = audioCtx.currentTime + idx * 0.08;
        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.4);
      });
    } catch (e) {
      console.error(e);
    }
  }

  // 타이머 시간 완료 알람 소리 (3회 비프)
  function playAlarmSound() {
    initAudio();
    if (!audioCtx) return;
    try {
      for (let i = 0; i < 3; i++) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + i * 0.25);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime + i * 0.25);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.25 + 0.15);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + i * 0.25);
        osc.stop(audioCtx.currentTime + i * 0.25 + 0.15);
      }
    } catch (e) {
      console.error(e);
    }
  }

  // ------------------------------------------------------------------------
  // 3. 명단 파싱 및 업데이트 로직
  // ------------------------------------------------------------------------
  function updateRosterFromInput() {
    const rawText = rosterInput.value;
    roster = rawText
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);

    // 수동 명단 변경 시, 이미 삭제된 인원은 drawnSet에서도 제거
    const currentRosterSet = new Set(roster);
    drawnSet.forEach(name => {
      if (!currentRosterSet.has(name)) {
        drawnSet.delete(name);
      }
    });

    updateRosterStats();
    renderDrawnTags();
  }

  function getAvailableCandidates() {
    if (excludeDrawnCheck.checked) {
      return roster.filter(name => !drawnSet.has(name));
    }
    return roster;
  }

  function updateRosterStats() {
    const total = roster.length;
    const available = getAvailableCandidates().length;
    totalCountEl.textContent = total;
    availableCountEl.textContent = available;
  }

  function renderDrawnTags() {
    drawnCountEl.textContent = drawnSet.size;
    if (drawnSet.size === 0) {
      drawnTagsEl.innerHTML = '<span class="empty-tag">없음</span>';
      return;
    }
    drawnTagsEl.innerHTML = Array.from(drawnSet)
      .map(name => `<span class="drawn-tag">${escapeHtml(name)}</span>`)
      .join('');
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // 명단 프리셋 이벤트
  presetNumbersBtn.addEventListener('click', () => {
    const nums = Array.from({ length: 25 }, (_, i) => `${i + 1}번`);
    rosterInput.value = nums.join(', ');
    updateRosterFromInput();
  });

  presetSampleBtn.addEventListener('click', () => {
    const sample = ['강하늘', '김도윤', '박서준', '이영희', '최유진', '윤지후', '손흥민', '이강인', '임서연', '안유진', '김철수', '장원영'];
    rosterInput.value = sample.join(', ');
    updateRosterFromInput();
  });

  clearRosterBtn.addEventListener('click', () => {
    rosterInput.value = '';
    drawnSet.clear();
    updateRosterFromInput();
  });

  rosterInput.addEventListener('input', updateRosterFromInput);
  excludeDrawnCheck.addEventListener('change', updateRosterStats);

  // ------------------------------------------------------------------------
  // 4. 발표자 추첨 롤링 애니메이션
  // ------------------------------------------------------------------------
  drawBtn.addEventListener('click', () => {
    if (isRolling) return;
    initAudio();

    const candidates = getAvailableCandidates();
    if (candidates.length === 0) {
      if (roster.length === 0) {
        alert('학생 명단을 먼저 입력해 주세요!');
      } else {
        alert('모든 학생이 추첨되었습니다! "제외 목록 리셋" 버튼을 눌러주세요.');
      }
      return;
    }

    isRolling = true;
    drawBtn.disabled = true;
    resetDrawnBtn.disabled = true;

    let duration = 2000; // 2초간 롤링
    let intervalTime = 50; // 50ms 마다 변환
    let elapsed = 0;

    const rollingInterval = setInterval(() => {
      const randomCandidate = candidates[Math.floor(Math.random() * candidates.length)];
      rollingBox.innerHTML = `<span>${escapeHtml(randomCandidate)}</span>`;
      playTickSound();

      elapsed += intervalTime;
      if (elapsed >= duration) {
        clearInterval(rollingInterval);

        // 최종 추첨된 당첨자 결정
        const winner = candidates[Math.floor(Math.random() * candidates.length)];
        rollingBox.innerHTML = `<span>${escapeHtml(winner)}</span>`;

        if (excludeDrawnCheck.checked) {
          drawnSet.add(winner);
          renderDrawnTags();
          updateRosterStats();
        }

        isRolling = false;
        drawBtn.disabled = false;
        resetDrawnBtn.disabled = false;

        // 대형 팝업 모달 띄우기
        showWinnerModal(winner);
      }
    }, intervalTime);
  });

  resetDrawnBtn.addEventListener('click', () => {
    drawnSet.clear();
    renderDrawnTags();
    updateRosterStats();
  });

  // 모달 팝업 & 폭죽 애니메이션
  function showWinnerModal(name) {
    winnerNameDisplay.textContent = name;
    resultModal.classList.add('active');
    playFanfareSound();
    triggerConfetti();
  }

  closeModalBtn.addEventListener('click', () => {
    resultModal.classList.remove('active');
  });

  resultModal.addEventListener('click', (e) => {
    if (e.target === resultModal) {
      resultModal.classList.remove('active');
    }
  });

  // ------------------------------------------------------------------------
  // 5. 발표 타이머 로직
  // ------------------------------------------------------------------------
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function updateTimerDisplay() {
    timerDisplay.textContent = formatTime(timerRemaining);
    const percent = (timerRemaining / timerDuration) * 100;
    timerProgress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }

  function setTimerPreset(seconds) {
    pauseTimer();
    timerDuration = seconds;
    timerRemaining = seconds;
    timerDisplay.classList.remove('timer-alert');
    timerStateBadge.textContent = '준비';
    timerStateBadge.style.background = 'rgba(255, 255, 255, 0.1)';
    timerStateBadge.style.color = 'var(--text-secondary)';
    updateTimerDisplay();
  }

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const timeVal = parseInt(btn.getAttribute('data-time'), 10);
      setTimerPreset(timeVal);
    });
  });

  function startTimer() {
    if (isTimerRunning || timerRemaining <= 0) return;
    initAudio();
    isTimerRunning = true;
    startTimerBtn.disabled = true;
    pauseTimerBtn.disabled = false;
    timerStateBadge.textContent = '진행 중';
    timerStateBadge.style.background = 'rgba(16, 185, 129, 0.2)';
    timerStateBadge.style.color = '#34d399';

    timerInterval = setInterval(() => {
      timerRemaining--;
      updateTimerDisplay();

      if (timerRemaining <= 0) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        startTimerBtn.disabled = false;
        pauseTimerBtn.disabled = true;
        
        timerStateBadge.textContent = '시간 종료!';
        timerStateBadge.style.background = 'rgba(239, 68, 68, 0.2)';
        timerStateBadge.style.color = '#fca5a5';
        timerDisplay.classList.add('timer-alert');
        
        playAlarmSound();
      }
    }, 1000);
  }

  function pauseTimer() {
    if (!isTimerRunning) return;
    clearInterval(timerInterval);
    isTimerRunning = false;
    startTimerBtn.disabled = false;
    pauseTimerBtn.disabled = true;
    timerStateBadge.textContent = '일시정지';
    timerStateBadge.style.background = 'rgba(245, 158, 11, 0.2)';
    timerStateBadge.style.color = '#fbbf24';
  }

  function resetTimer() {
    pauseTimer();
    timerRemaining = timerDuration;
    timerDisplay.classList.remove('timer-alert');
    timerStateBadge.textContent = '준비';
    timerStateBadge.style.background = 'rgba(255, 255, 255, 0.1)';
    timerStateBadge.style.color = 'var(--text-secondary)';
    updateTimerDisplay();
  }

  startTimerBtn.addEventListener('click', startTimer);
  pauseTimerBtn.addEventListener('click', pauseTimer);
  resetTimerBtn.addEventListener('click', resetTimer);

  // ------------------------------------------------------------------------
  // 6. Confetti (폭죽) Particle Canvas Animation
  // ------------------------------------------------------------------------
  const ctx = confettiCanvas.getContext('2d');
  let particles = [];

  function resizeCanvas() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function triggerConfetti() {
    particles = [];
    const colors = ['#38bdf8', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#f43f5e'];
    for (let i = 0; i < 120; i++) {
      particles.push({
        x: confettiCanvas.width / 2,
        y: confettiCanvas.height / 2,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.7) * 18,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rSpeed: (Math.random() - 0.5) * 10,
        opacity: 1
      });
    }
    requestAnimationFrame(updateConfetti);
  }

  function updateConfetti() {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    let active = false;

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // 중력
      p.rotation += p.rSpeed;
      p.opacity -= 0.012;

      if (p.opacity > 0) {
        active = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    });

    if (active) {
      requestAnimationFrame(updateConfetti);
    }
  }

  // 초기화 실행
  const sample = ['강하늘', '김도윤', '박서준', '이영희', '최유진', '윤지후', '손흥민', '이강인', '임서연', '안유진', '김철수', '장원영'];
  rosterInput.value = sample.join(', ');
  updateRosterFromInput();
  updateTimerDisplay();
});
