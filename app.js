/* ==========================================================================
   페이스 코치 (Pace Coach) — AI 러닝 트레이닝 코치
   Vanilla JS · localStorage · optional Vision API (Claude / OpenAI)
   ========================================================================== */
(function () {
  "use strict";

  var LS_KEY = "pacecoach.v1";
  var APP_VERSION = "1.2.0";
  var DAY = 86400000;

  /* ------------------------------------------------------------------ *
   *  유틸
   * ------------------------------------------------------------------ */
  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fromISO(s) {
    var p = String(s).split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0);
  }
  function todayISO() { return iso(new Date()); }
  function daysBetween(aISO, bISO) { return Math.round((fromISO(bISO) - fromISO(aISO)) / DAY); }
  function weekStartISO(dateISO) {
    var d = fromISO(dateISO);
    var off = (d.getDay() + 6) % 7; // 월요일 시작
    d.setDate(d.getDate() - off);
    return iso(d);
  }
  function addDays(dateISO, n) {
    var d = fromISO(dateISO);
    d.setDate(d.getDate() + n);
    return iso(d);
  }
  var WD = ["일", "월", "화", "수", "목", "금", "토"];
  function wdKo(dateISO) { return WD[fromISO(dateISO).getDay()]; }
  function mdKo(dateISO) {
    var d = fromISO(dateISO);
    return (d.getMonth() + 1) + "/" + d.getDate();
  }
  function fullDateKo(dateISO) {
    var d = fromISO(dateISO);
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + WD[d.getDay()] + ")";
  }
  function fmtTime(sec, dash) {
    if (sec == null || !isFinite(sec) || sec <= 0) return dash || "—";
    sec = Math.round(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0 ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
  }
  function fmtPace(spk) {
    if (!spk || !isFinite(spk) || spk <= 0) return "—";
    var s = Math.round(spk);
    return Math.floor(s / 60) + "'" + pad(s % 60) + "\"";
  }
  function parseTimeInput(str) {
    if (!str) return null;
    var parts = String(str).trim().split(":").map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1 && parts[0] > 0) return parts[0] * 60;
    return null;
  }
  function fmtKm(km) {
    if (km == null || !isFinite(km)) return "—";
    var v = Math.round(km * 100) / 100;
    return Number.isInteger(v) ? v.toFixed(1) : String(v);
  }
  function roundHalf(v) { return Math.round(v * 2) / 2; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function riegel(t, d1, d2) { return t * Math.pow(d2 / d1, 1.06); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function uid(p) { return (p || "id") + "_" + Math.random().toString(36).slice(2, 9); }

  var DIST_LABEL = { "5": "5km", "10": "10km", "21.0975": "하프", "42.195": "풀" };
  function distLabel(km) {
    for (var k in DIST_LABEL) if (Math.abs(Number(k) - km) < 0.001) return DIST_LABEL[k];
    return fmtKm(km) + "km";
  }

  /* ------------------------------------------------------------------ *
   *  초기 데이터 (현수 님 실제 대회 + 탄천 샘플 기록)
   * ------------------------------------------------------------------ */
  function defaultState() {
    return {
      v: 1,
      tab: "home",
      activeRaceId: "r_ggp",
      settings: { provider: "none", apiKey: "", model: "", maxHr: 174, athlete: "현수" },
      races: [
        {
          id: "r_ggp",
          name: "제4회 가든파이브 라이프 레이스",
          date: "2026-12-05",
          distance: 10,
          goalSec: 3000,
          start: "10:10",
          place: "가든파이브 라이프 중앙광장 (탄천 코스)"
        },
        {
          id: "r_sn",
          name: "2026 성남 헤리티지 런",
          date: "2026-12-12",
          distance: 10,
          goalSec: 3000,
          start: "08:30",
          place: "탄천종합운동장"
        }
      ],
      runs: [
        {
          id: "run_1109",
          date: "2026-11-09",
          distanceKm: 6.04,
          durationSec: 2180,
          avgHr: 130,
          cadence: 166,
          condition: "good",
          memo: "숯내교~광평교~대곡교 순환. 저녁 탄천, 바람 잔잔",
          source: "sample"
        },
        {
          id: "run_1113",
          date: "2026-11-13",
          distanceKm: 5,
          durationSec: 1550,
          avgHr: 154,
          cadence: 172,
          condition: "normal",
          memo: "템포런 5km, 마지막 1km는 4:55로 올림",
          source: "sample"
        },
        {
          id: "run_1117",
          date: "2026-11-17",
          distanceKm: 8.35,
          durationSec: 2992,
          avgHr: 141,
          cadence: 167,
          condition: "knee",
          memo: "탄천 8km. 6km 지나니 오른쪽 무릎 바깥이 뻐근",
          source: "sample"
        }
      ],
      done: {}
    };
  }

  /* ------------------------------------------------------------------ *
   *  저장 / 상태
   * ------------------------------------------------------------------ */
  var state = loadState();
  var draft = newDraft();
  var tuned = null; // 이미지 분석 임시 상태

  function newDraft() {
    return {
      editingId: null,
      date: todayISO(),
      km: "",
      time: "",
      hr: "",
      cadence: "",
      memo: "",
      condition: "good",
      image: null,
      imageName: "",
      analysis: null,
      busy: false,
      status: "",
      error: ""
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaultState();
      var s = JSON.parse(raw);
      if (!s || !Array.isArray(s.races) || !Array.isArray(s.runs)) return defaultState();
      s.settings = s.settings || {};
      if (s.settings.maxHr == null) s.settings.maxHr = 174;
      if (!s.settings.provider) s.settings.provider = "none";
      s.done = s.done || {};
      if (!s.races.some(function (r) { return r.id === s.activeRaceId; })) {
        s.activeRaceId = s.races.length ? s.races[0].id : null;
      }
      return s;
    } catch (e) {
      return defaultState();
    }
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }
  function activeRace() {
    return state.races.filter(function (r) { return r.id === state.activeRaceId; })[0] || state.races[0] || null;
  }

  /* ------------------------------------------------------------------ *
   *  체력 추정 · 예상 기록
   * ------------------------------------------------------------------ */
  function bestEq10(runs) {
    var best = null, today = todayISO();
    runs.forEach(function (r) {
      if (!(r.distanceKm > 0.5) || !(r.durationSec > 0)) return;
      var ago = daysBetween(r.date, today);
      if (ago < 0 || ago > 56) return;
      var t = riegel(r.durationSec, r.distanceKm, 10);
      if (r.distanceKm < 3) t *= 1.03;
      if (best === null || t < best) best = t;
    });
    return best;
  }

  function fitness() {
    var raw = bestEq10(state.runs);
    var today = todayISO();
    var recent = state.runs.filter(function (r) {
      var ago = daysBetween(r.date, today);
      return ago >= 0 && ago <= 7;
    });
    var knee = recent.some(function (r) { return r.condition === "knee"; });
    var fatigue = recent.some(function (r) { return r.condition === "fatigue"; });
    var base = raw;
    if (base == null) {
      var ar = activeRace();
      base = ar ? riegel(ar.goalSec, ar.distance, 10) * 1.06 : 3300;
    }
    var penalty = knee ? 1.04 : fatigue ? 1.02 : 1;
    var eq10 = base * penalty;
    return {
      eq10: eq10,
      raw: raw,
      pace: eq10 / 10,
      knee: knee,
      fatigue: fatigue,
      flag: knee || fatigue,
      condition: knee ? "knee" : fatigue ? "fatigue" : null,
      estimated: raw !== null
    };
  }
  function predictRace(race, fit) {
    if (!race) return null;
    return riegel(fit.eq10, 10, race.distance);
  }

  /* 한 번의 렌더 안에서 계획을 재사용 (진단·홈·훈련 탭이 같은 계산을 공유) */
  var planCache = null;
  function cachedPlan() {
    if (planCache) return planCache;
    var race = activeRace();
    planCache = race ? buildPlan(race, fitness()) : { weeks: [], days: [], paces: null };
    return planCache;
  }

  /* ------------------------------------------------------------------ *
   *  주간 거리 통계
   * ------------------------------------------------------------------ */
  function kmBetween(aISO, bISO) {
    return state.runs.reduce(function (acc, r) {
      if (r.date >= aISO && r.date < bISO) acc += r.distanceKm;
      return acc;
    }, 0);
  }
  function weeklyStats() {
    var ws = weekStartISO(todayISO());
    var thisWeek = kmBetween(ws, addDays(ws, 7));
    var lastWeek = kmBetween(addDays(ws, -7), ws);
    var four = 0;
    for (var i = 0; i < 4; i++) four += kmBetween(addDays(ws, -7 * i), addDays(ws, -7 * i + 7));
    return { ws: ws, thisWeek: thisWeek, lastWeek: lastWeek, avg4: four / 4, total4: four };
  }

  /* ------------------------------------------------------------------ *
   *  훈련 플랜 생성
   * ------------------------------------------------------------------ */
  var TYPE = {
    rest: { label: "휴식 · 보강", color: "dim", rpe: "–" },
    recovery: { label: "회복런", color: "cyan", rpe: "2/10" },
    easy: { label: "이지런", color: "lime", rpe: "3/10" },
    long: { label: "장거리 (LSD)", color: "violet", rpe: "4/10" },
    tempo: { label: "템포런", color: "amber", rpe: "6/10" },
    interval: { label: "인터벌", color: "red", rpe: "8/10" },
    rehearsal: { label: "페이스 리허설", color: "amber", rpe: "5/10" },
    race: { label: "레이스", color: "lime", rpe: "8~9/10" }
  };
  var HR_ZONE = {
    recovery: [0.6, 0.68],
    easy: [0.65, 0.75],
    long: [0.67, 0.78],
    tempo: [0.82, 0.88],
    interval: [0.88, 0.94],
    rehearsal: [0.8, 0.87],
    race: [0.85, 0.92]
  };

  var TEMPLATE = { 1: "rest", 2: "interval", 3: "easy", 4: "tempo", 5: "rest", 6: "long", 0: "recovery" };
  var TEMPLATE_TAPER = { 1: "rest", 2: "easy", 3: "rehearsal", 4: "rest", 5: "easy", 6: "easy", 0: "rest" };
  function templateFor(taper) { return taper ? TEMPLATE_TAPER : TEMPLATE; }

  /* 지난 날짜의 계획 종류(요일 템플릿). 진단에서 "그날이 쉬운 날이었는지" 판단에 쓴다. */
  function expectedTypeOn(dateISO) {
    var race = activeRace();
    if (!race) return null;
    var toRace = daysBetween(dateISO, race.date);
    if (toRace < 0) return null;
    return templateFor(toRace <= 6)[fromISO(dateISO).getDay()] || "rest";
  }

  /* 휴식·보강 카드에 쓰는 무릎 보호 루틴 (중둔근/코어) */
  var REST_ROUTINE = [
    { name: "힙 브리지", spec: "12회 × 3세트" },
    { name: "밴드 사이드 스텝", spec: "15보 × 3세트" },
    { name: "클램쉘", spec: "20회 × 3세트" },
    { name: "플랭크", spec: "45초 × 3세트" }
  ];

  function baseWeekly(dist) {
    if (dist <= 5) return 18;
    if (dist <= 10) return 26;
    if (dist <= 21.1) return 40;
    return 58;
  }

  function buildPlan(race, fit) {
    if (!race) return { weeks: [], days: [] };
    var today = todayISO();
    var startISO = weekStartISO(today);
    var maxHR = state.settings.maxHr || 174;
    var goalPace = race.goalSec / race.distance;
    var P = {
      rec: fit.pace + 85,
      easy: fit.pace + 50,
      long: fit.pace + 60,
      tempo: fit.pace - 10,
      rep: fit.pace - 32,
      goal: goalPace
    };
    var base = baseWeekly(race.distance);
    var days = [];
    var cursor = fromISO(startISO);
    var guard = 0;

    while (guard++ < 400) {
      var dateISO = iso(cursor);
      var toRace = daysBetween(dateISO, race.date);
      if (toRace < 0) break;
      var wd = cursor.getDay();
      var weekIdx = Math.floor(daysBetween(startISO, dateISO) / 7);
      var taper = toRace <= 6;
      var volume = base * Math.min(1.12, 1 + 0.025 * weekIdx);
      var s = makeSession({
        wd: wd, taper: taper, toRace: toRace, road: race, P: P,
        volume: volume, maxHR: maxHR, weekIdx: weekIdx
      });
      s.date = dateISO;
      s.weekIdx = weekIdx;
      s.wd = wd;
      s.done = !!state.done[race.id + ":" + dateISO];
      s.isToday = dateISO === today;
      s.isPast = daysBetween(dateISO, today) > 0;
      days.push(s);
      cursor.setDate(cursor.getDate() + 1);
    }

    // 컨디션(무릎/피로) 신호 → 이번 주 강도 훈련 자동 다운그레이드
    if (fit.flag) {
      var thisWeek = weekStartISO(today);
      var targets = fit.knee ? ["interval", "tempo", "long", "easy"] : ["interval", "tempo", "long"];
      days.forEach(function (d) {
        if (weekStartISO(d.date) !== thisWeek) return;
        if (targets.indexOf(d.type) === -1) return;
        d.originalType = d.type;
        d.type = "recovery";
        d.tip = "";
        d.routine = null;
        d.caution = "";
        d.km = Math.max(3, Math.min(6, roundHalf(d.km * (d.originalType === "easy" ? 0.7 : 0.6))));
        d.title = TYPE.recovery.label + " " + fmtKm(d.km) + "km";
        d.paceLo = P.rec - 8;
        d.paceHi = P.rec + 12;
        d.hrs = hrRange("recovery", maxHR);
        d.rpe = TYPE.recovery.rpe;
        d.adjusted = true;
        d.detail = "컨디션 신호로 강도 훈련 → 회복런으로 대체";
        d.why = "'" + (fit.knee ? "무릎 뻐근함" : "피로 누적") + "' 기록이 있어 " +
          TYPE[d.originalType].label + " 대신 회복런으로 바꿨어요. 통증이 3일 이상 이어지면 러닝을 쉬고 대퇴사두근·둔근 강화로 대체하세요.";
      });
    }

    // 연속 러닝 금지: 어제 기록이 있는데 오늘이 고강도/장거리면 미루도록 주의 배지
    var yesterday = addDays(today, -1);
    var ranYesterday = state.runs.some(function (r) { return r.date === yesterday && r.distanceKm > 0; });
    if (ranYesterday) {
      days.forEach(function (d) {
        if (d.date !== today) return;
        if (["interval", "tempo", "long", "rehearsal"].indexOf(d.type) === -1) return;
        d.consecutive = true;
        d.consecutiveNote = "어제(" + mdKo(yesterday) + ") 달리셨으니 오늘은 휴식·보강으로 미루고 내일 뛰는 걸 권장해요. " +
          (d.type === "long"
            ? "장거리는 내일로 옮기고, 오늘 꼭 뛰어야 한다면 회복런 5km 이하로 줄이세요."
            : "오늘 꼭 뛰어야 한다면 " + TYPE[d.type].label + " 대신 이지런 30분으로 낮춰 주세요.");
      });
    }

    // 주 단위 그룹화
    var weeks = [];
    days.forEach(function (d) {
      var w = weeks[weeks.length - 1];
      if (!w || w.idx !== d.weekIdx) {
        w = { idx: d.weekIdx, start: d.date, days: [] };
        weeks.push(w);
      }
      w.days.push(d);
    });
    weeks.forEach(function (w) {
      w.end = addDays(w.start, 6);      w.km = w.days.reduce(function (a, d) { return a + (d.km || 0); }, 0);
      w.label = w.idx === 0 ? "이번 주" :
        (daysBetween(w.end, race.date) <= 0 && daysBetween(w.start, race.date) < 7 ? "대회 주간" : w.idx + "주차");
    });
    return { weeks: weeks, days: days, paces: P, goalPace: goalPace };
  }

  function hrRange(type, maxHR) {
    var z = HR_ZONE[type] || HR_ZONE.easy;
    return [Math.round(maxHR * z[0]), Math.round(maxHR * z[1])];
  }

  function makeSession(o) {
    var wd = o.wd, road = o.road, P = o.P, V = o.volume, maxHR = o.maxHR;
    var goalTxt = fmtTime(road.goalSec) + " (" + fmtPace(P.goal) + "/km)";
    var s = { type: "rest", km: 0, paceLo: null, paceHi: null, hrs: null, detail: "", why: "" };

    /* 대회 당일 */
    if (o.toRace === 0) {
      s.type = "race";
      s.title = road.name;
      s.km = road.distance;
      s.paceLo = P.goal - 5;
      s.paceHi = P.goal + 5;
      s.hrs = hrRange("race", maxHR);
      s.rpe = TYPE.race.rpe;
      s.detail = (road.start ? road.start + " 출발" : "") + (road.place ? " · " + road.place : "");
      s.why = "목표 " + goalTxt + ". 초반 2km는 계획보다 5초 느리게, 마지막 3km에서 승부를 걸어요. 출발 2시간 전 가벼운 식사, 30분 전 워밍업 10분.";
      return s;
    }

    /* 템플릿 */
    var type = templateFor(o.taper)[wd] || "rest";

    if (type === "rest") {
      s.type = "rest";
      s.title = TYPE.rest.label;
      s.rpe = TYPE.rest.rpe;
      s.detail = "중둔근·코어 보강 4종 · 폼롤러 5분 · 종아리 스트레칭";
      s.routine = REST_ROUTINE;
      s.caution = "스쿼트 등 깊은 무릎 굴곡은 통증 시 제외";
      s.why = o.taper
        ? "대회 전 회복이 훈련의 일부입니다. 다리에 피로를 남기지 않는 게 목표예요."
        : "근육은 쉬는 동안 강해집니다. 특히 중둔근이 약하면 착지 때 무릎이 안쪽으로 무너지면서 바깥쪽(장경인대)에 부하가 몰려요. 20분만 채워 두세요.";
      return s;
    }

    if (type === "easy" && o.taper) {
      s.type = "easy";
      s.km = roundHalf(V * 0.15);
      s.paceLo = P.easy - 5; s.paceHi = P.easy + 20;
      s.title = "이지런 " + fmtKm(s.km) + "km";
      s.hrs = hrRange("easy", maxHR);
      s.rpe = TYPE.easy.rpe;
      s.detail = "대화가 가능한 속도 · 마지막 1km는 스트라이드 4회";
      s.why = "테이퍼링 중에는 거리보다 감각 유지가 중요해요. 다리를 가볍게 깨우는 정도면 충분합니다.";
      return s;
    }

    if (type === "rehearsal") {
      s.type = "rehearsal";
      var rt = clamp(roundHalf(V * 0.1), 2, 5);
      s.km = rt + 2.2;
      s.paceLo = P.goal - 3; s.paceHi = P.goal + 8;
      s.title = "페이스 리허설 " + fmtKm(s.km) + "km";
      s.hrs = hrRange("rehearsal", maxHR);
      s.rpe = TYPE.rehearsal.rpe;
      s.detail = "워밍업 1.2km → 목표 페이스 " + rt + "km (" + fmtPace(P.goal) + "/km) → 쿨다운 1km";
      s.why = "대회 목표 페이스를 몸에 기억시키는 마지막 점검. 짧게, 여유 있게. 힘들면 페이스를 낮춰도 됩니다.";
      return s;
    }

    if (type === "interval") {
      s.type = "interval";
      var reps = clamp(Math.round(V / 5), 4, 10);
      s.km = 1.5 + reps * 0.4 + (reps - 1) * 0.2 + 1.0;
      s.paceLo = P.rep - 5; s.paceHi = P.rep + 5;
      s.title = "인터벌 400m × " + reps;
      s.hrs = hrRange("interval", maxHR);
      s.rpe = TYPE.interval.rpe;
      s.detail = "워밍업 1.5km → 400m × " + reps + " (" + fmtPace(P.rep) + "/km, 사이 200m 조깅) → 쿨다운 1km";
      s.why = "10km 목표 페이스보다 빠른 구간으로 심폐와 다리 회전을 자극합니다. " + fmtPace(P.goal) + "/km를 버티는 힘이 여기서 나와요.";
      return s;
    }

    if (type === "tempo") {
      s.type = "tempo";
      var tt = clamp(roundHalf(V * 0.12), 2, 8);
      s.km = tt + 2.5;
      s.paceLo = P.tempo - 6; s.paceHi = P.tempo + 6;
      s.title = "템포런 " + fmtKm(s.km) + "km";
      s.hrs = hrRange("tempo", maxHR);
      s.rpe = TYPE.tempo.rpe;
      s.detail = "워밍업 1.5km → 템포 " + tt + "km (" + fmtPace(P.tempo) + "/km) → 쿨다운 1km";
      s.why = "젖산 역치를 끌어올려 후반 3km에서 페이스가 무너지지 않게 만드는 훈련. 숨이 차지만 3~4문장은 말할 수 있는 강도입니다.";
      return s;
    }

    if (type === "long") {
      s.type = "long";
      s.km = roundHalf(V * 0.35);
      s.paceLo = P.long - 6; s.paceHi = P.long + 18;
      s.title = "장거리 " + fmtKm(s.km) + "km";
      s.hrs = hrRange("long", maxHR);
      s.rpe = TYPE.long.rpe;
      s.detail = s.km >= 12
        ? "9분 달리기 + 1분 걷기(런-워크) · 첫 1km는 의도적으로 느리게"
        : "대화 가능한 페이스 · 첫 1km는 의도적으로 느리게 · 후반 2km만 살짝 올려도 OK";
      if (s.km >= 12) {
        s.tip = "9분 달리기 + 1분 걷기(런-워크) 권장 — 걷는 1분에 심박이 떨어져 후반 무릎 부담이 줄어요. 첫 1km는 의도적으로 느리게 시작하세요.";
      }
      s.why = "지구력 기반을 쌓는 날입니다. 기록은 신경 쓰지 말고 '오래 편하게'만 지키세요. 이 거리가 대회 후반을 지켜줍니다.";
      return s;
    }

    // easy
    s.type = "easy";
    s.km = roundHalf(V * 0.2);
    s.paceLo = P.easy - 5; s.paceHi = P.easy + 15;
    s.title = "이지런 " + fmtKm(s.km) + "km";
    s.hrs = hrRange("easy", maxHR);
    s.rpe = TYPE.easy.rpe;
    s.detail = "심박 " + s.hrs[0] + "~" + s.hrs[1] + "bpm 유지 · 케이던스 168~172";
    s.why = "쉬는 것도 훈련입니다. 오늘 무리하면 목요일 템포런이 망가져요. 느리게 달리는 연습을 하세요.";
    return s;
  }

  /* ------------------------------------------------------------------ *
   *  코치 코멘트 (규칙 기반 / AI) + 자동 진단
   * ------------------------------------------------------------------ */
  var EASY_TYPES = { easy: 1, recovery: 1, long: 1 };

  /* 그날 계획된 훈련이 "느리게 뛰어야 하는 날"이었는지 판단하기 위한 기준 페이스 */
  function plannedFastPace(type, f) {
    if (type === "recovery") return f.pace + 85 - 8;
    if (type === "easy") return f.pace + 50 - 5;
    if (type === "long") return f.pace + 60 - 6;
    return null;
  }

  /* 기록 1건에 대한 진단: 오버페이스 · 케이던스 · 손목 심박 센서 */
  function diagnoseRun(run) {
    var out = [];
    if (!run || !(run.distanceKm > 0) || !(run.durationSec > 0)) return out;
    var pace = run.durationSec / run.distanceKm;
    var f = fitness();
    var plan = cachedPlan();
    var sess = null;
    (plan.days || []).forEach(function (d) { if (d.date === run.date) sess = d; });
    var type = sess ? sess.type : expectedTypeOn(run.date);

    /* 1) 오버페이스: 계획이 이지·회복·장거리였는데 20초/km 이상 빨랐는지 */
    if (type && EASY_TYPES[type]) {
      var fast = sess && sess.paceLo ? sess.paceLo : plannedFastPace(type, f);
      if (fast) {
        var gap = Math.round(fast - pace);
        if (gap >= 20) {
          var zoneTxt = sess && sess.paceHi
            ? TYPE[type].label + " " + fmtPace(sess.paceLo) + "~" + fmtPace(sess.paceHi)
            : TYPE[type].label + " " + fmtPace(fast) + " 내외";
          out.push({
            key: "overpace",
            level: "red",
            badge: "오버페이스 +" + gap + "초/km",
            title: "오버페이스",
            text: "계획(" + zoneTxt + ")보다 " + gap + "초/km 빠르게 뛰셨어요! 쉬운 날이 없으면 무릎 회복이 안 돼요. 다음 " +
              (type === "long" ? "장거리" : type === "recovery" ? "회복런" : "이지런") + "은 " +
              fmtPace(fast + 10) + "/km 이상으로 속도를 낮춰 주세요.",
            gap: gap
          });
        }
      }
    }

    /* 2) 케이던스 165 미만: 보폭이 길어 무릎 충격이 커짐 */
    if (run.cadence && run.cadence < 165) {
      out.push({
        key: "cadence",
        level: "amber",
        badge: "케이던스 " + run.cadence + "spm",
        title: "케이던스 낮음",
        text: "보폭이 길어 무릎 충격이 커질 수 있어요. 메트로놈 168~172 BPM에 맞춰 보폭을 줄여 보세요."
      });
    }

    /* 3) 손목 심박 센서 오측정: 빠른 페이스인데 심박이 비정상적으로 낮음 */
    if (run.avgHr && run.avgHr > 0 && run.avgHr < 125 && pace <= 405) {
      out.push({
        key: "wristHr",
        level: "violet",
        badge: "손목 심박 의심",
        title: "손목 센서 오측정 가능성",
        text: "빠른 페이스 대비 심박이 낮게 찍혔어요(손목 센서 오측정 가능성). 숫자보다 '옆사람과 문장으로 대화 가능한지' 체감 강도로 판단하세요."
      });
    }

    return out;
  }

  function diagChips(diag) {
    if (!diag || !diag.length) return "";
    return '<div class="diag-row">' + diag.map(function (d) {
      return '<span class="chip ' + d.level + '">' + esc(d.badge) + "</span>";
    }).join("") + "</div>";
  }

  function diagBlocks(diag) {
    if (!diag || !diag.length) return "";
    return diag.map(function (d) {
      return '<div class="diag ' + d.level + '"><b>' + esc(d.title) + "</b> " + esc(d.text) + "</div>";
    }).join("");
  }

  function coachNote(run, diag) {
    if (run.aiCoach) return run.aiCoach;
    diag = diag || diagnoseRun(run);
    var has = {};
    diag.forEach(function (d) { has[d.key] = true; });
    var f = fitness();
    var pace = run.durationSec / run.distanceKm;
    var maxHR = state.settings.maxHr || 174;
    var out = [];
    if (!has.overpace && pace <= f.pace - 12) {
      out.push("평균 " + fmtPace(pace) + "는 현재 추정 10K 페이스(" + fmtPace(f.pace) + ")보다 빠른 강도예요. 이런 날은 주 1회면 충분합니다.");
    } else if (pace >= f.pace + 45) {
      out.push("평균 " + fmtPace(pace) + " · " + fmtKm(run.distanceKm) + "km, 딱 좋은 이지 강도였어요. 이 속도를 지켜야 다음 강도 훈련이 살아납니다.");
    } else if (!has.overpace) {
      out.push("평균 " + fmtPace(pace) + " · " + fmtKm(run.distanceKm) + "km 기록을 반영했어요. 훈련 계획과 예상 기록을 다시 계산했습니다.");
    }
    if (run.avgHr) {
      var easyTop = Math.round(maxHR * 0.75);
      if (run.avgHr > easyTop + 5 && pace >= f.pace + 30) {
        out.push("심박 " + run.avgHr + "bpm은 이 페이스치고 조금 높아요. 더위·수면 부족이 원인일 수 있으니 다음 이지런은 20~30초/km 늦춰 보세요.");
      } else if (run.avgHr <= easyTop && pace <= f.pace + 20 && !has.wristHr) {
        out.push("심박 " + run.avgHr + "bpm으로 페이스를 잘 통제했어요.");
      }
    }
    if (run.condition === "knee") {
      out.push("무릎 뻐근함이 있어 이번 주 강도 훈련을 회복런으로 낮췄어요. 3일 이상 이어지거나 계단 내려올 때 아프면 러닝을 쉬고 대퇴사두근·둔근 강화로 바꾸세요.");
    } else if (run.condition === "fatigue") {
      out.push("피로 누적 신호예요. 48시간은 수면과 단백질 회복에 쓰고, 다음 러닝은 페이스보다 심박을 먼저 보세요.");
    }
    return out.slice(0, 2).join(" ");
  }

  /* ------------------------------------------------------------------ *
   *  렌더링
   * ------------------------------------------------------------------ */
  var view = document.getElementById("view");
  var tabbar = document.getElementById("tabbar");
  var topbar = document.getElementById("topbar");

  function render() {
    planCache = null;
    var race = activeRace();
    if (state.tab === "home") view.innerHTML = viewHome(race);
    else if (state.tab === "add") view.innerHTML = viewAdd(race);
    else if (state.tab === "plan") view.innerHTML = viewPlan(race);
    else view.innerHTML = viewSettings(race);
    renderTabbar();
    if (state.tab === "add") syncPacePreview();
    window.scrollTo({ top: 0 });
  }

  function renderTabbar() {
    var tabs = [
      { id: "home", label: "홈", icon: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>' },
      { id: "add", label: "기록", icon: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>' },
      { id: "plan", label: "훈련", icon: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3.5v3M16 3.5v3"/>' },
      { id: "settings", label: "설정", icon: '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2.2"/><circle cx="15" cy="12" r="2.2"/><circle cx="8" cy="17" r="2.2"/>' }
    ];
    tabbar.innerHTML = tabs.map(function (t) {
      return '<button class="tab ' + (state.tab === t.id ? "on" : "") + '" data-act="tab|' + t.id + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        t.icon + "</svg><span>" + t.label + "</span></button>";
    }).join("");
  }

  /* ------------------------------ 홈 ------------------------------ */
  function viewHome(race) {
    var f = fitness();
    var ws = weeklyStats();
    if (!race) {
      return '<div class="stack"><div class="empty">아직 대회가 없어요.<br>설정에서 목표 대회를 추가하면 D-Day와 훈련 계획이 만들어집니다.<br><br><button class="btn primary sm" data-act="tab|settings">대회 추가하기</button></div></div>';
    }
    var plan = cachedPlan();
    var toRace = daysBetween(todayISO(), race.date);
    var pred = predictRace(race, f);
    var goalPace = race.goalSec / race.distance;
    var diff = pred - race.goalSec;
    var todaySession = plan.days.filter(function (d) { return d.date === todayISO(); })[0];
    var planStart = addDays(race.date, -42);
    var progressPct = clamp(Math.round((daysBetween(planStart, todayISO()) / 42) * 100), 4, 100);
    var remaining = plan.days.filter(function (d) { return d.date >= todayISO() && d.type !== "rest"; }).length;
    var doneCount = plan.days.filter(function (d) { return d.done; }).length;
    var totalSessions = plan.days.filter(function (d) { return d.type !== "rest"; }).length;

    var html = "";
    html += '<h1>' + esc(state.settings.athlete || "러너") + '님, 오늘도 달릴까요?</h1>';
    html += '<p class="small dim" style="margin-bottom:14px">' + fullDateKo(todayISO()) + " · " + distLabel(race.distance) + " 대회까지 " + toRace + "일</p>";

    /* 대회 히어로 */
    html += '<div class="card hero">' +
      '<div class="hero-top">' +
      '<span class="chip lime">' + distLabel(race.distance) + "</span>" +
      '<span class="dday">' + (toRace < 0 ? "종료" : "D-" + toRace) + "</span>" +
      "</div>" +
      "<h2>" + esc(race.name) + "</h2>" +
      '<p class="hero-meta">' + fullDateKo(race.date) + (race.start ? " · " + esc(race.start) + " 출발" : "") + (race.place ? "<br>" + esc(race.place) : "") + "</p>" +
      '<div class="hero-metrics">' +
      '<div class="metric"><span class="k">목표 기록</span><strong class="num">' + fmtTime(race.goalSec) + '</strong><span class="sub num">' + fmtPace(goalPace) + "</span></div>" +
      '<div class="metric ' + (diff > 0 ? "alert" : "") + '"><span class="k">현재 예상 완주</span><strong class="num">' + fmtTime(pred) + "</strong><span class=\"sub num\">" + (diff > 0 ? "목표 +" + fmtTime(diff) : "목표 " + fmtTime(-diff) + " 단축") + "</span></div>" +
      "</div>" +
      '<div class="progress"><i style="width:' + progressPct + '%"></i></div>' +
      '<div class="hero-foot"><span>훈련 ' + remaining + "회 남음</span><span>" + doneCount + " / " + totalSessions + " 완료</span></div>" +
      "</div>";

    if (toRace < 0) {
      html += '<div class="note" style="margin-top:12px">이 대회는 이미 지났어요. 기록은 그대로 남아 있고, 새 대회를 추가하면 오늘부터의 계획을 새로 짜드려요.<br><br><button class="btn sm" data-act="tab|settings">새 대회 추가</button></div>';
    }

    /* 스탯 */
    html += '<div class="stats" style="margin-top:12px">' +
      '<div class="stat"><span class="k">이번 주</span><strong class="num">' + fmtKm(ws.thisWeek) + '</strong><span class="u">km · 지난주 ' + fmtKm(ws.lastWeek) + "</span></div>" +
      '<div class="stat"><span class="k">추정 10K</span><strong class="num">' + fmtTime(f.eq10) + '</strong><span class="u">' + fmtPace(f.pace) + "/km</span></div>" +
      '<div class="stat"><span class="k">4주 합계</span><strong class="num">' + fmtKm(ws.total4) + '</strong><span class="u">km · 최근 28일</span></div>' +
      "</div>";

    /* 오늘의 훈련 */
    html += '<div class="sec-title"><h2>오늘의 훈련</h2><span class="more">' + (toRace === 0 ? "대회 당일" : "자동 조정됨") + "</span></div>";
    html += todaySession ? cardToday(todaySession, f, race) : '<div class="empty">오늘은 계획된 훈련이 없어요. 휴식도 훈련입니다.</div>';

    /* 주간 바 */
    html += '<div class="sec-title"><h2>주간 거리</h2><span class="more">최근 4주</span></div>';
    html += '<div class="card"><div class="bars">';
    for (var i = 3; i >= 0; i--) {
      var s = addDays(ws.ws, -7 * i);
      var v = kmBetween(s, addDays(s, 7));
      var maxV = Math.max(12, ws.avg4 * 1.3, ws.thisWeek);
      var h = clamp(Math.round((v / maxV) * 100), 4, 100);
      html += '<div class="bar-col ' + (i === 0 ? "now" : "") + '">' +
        '<div class="bar" style="height:' + h + '%"></div>' +
        '<span class="lb">' + (i === 0 ? "이번" : mdKo(s)) + "</span>" +
        '<span class="lb num">' + Math.round(v) + "</span></div>";
    }
    html += "</div>";
    if (ws.thisWeek > ws.lastWeek * 1.2 && ws.lastWeek > 0) {
      html += '<p class="tiny" style="margin-top:10px;color:var(--amber)">지난 주보다 ' + Math.round((ws.thisWeek / ws.lastWeek - 1) * 100) + "% 늘었어요. 주 10% 이상 늘리면 부상 위험이 커지니 이번 주는 여기까지만.</p>";
    } else if (ws.thisWeek < ws.lastWeek * 0.8 && ws.lastWeek > 0) {
      html += '<p class="tiny" style="margin-top:10px">지난 주보다 ' + Math.round((1 - ws.thisWeek / ws.lastWeek) * 100) + "% 적어요. 남은 날에 이지런으로 채워볼까요?</p>";
    } else {
      html += '<p class="tiny" style="margin-top:10px">주간 볼륨이 안정적으로 유지되고 있어요.</p>';
    }
    html += "</div>";

    /* 최근 기록 */
    var recent = state.runs.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 3);
    html += '<div class="sec-title"><h2>최근 기록</h2><button class="more" data-act="tab|add">+ 추가</button></div>';
    if (!recent.length) {
      html += '<div class="empty">아직 기록이 없어요.<br>삼성헬스 캡처를 올리면 자동으로 채워집니다.</div>';
    } else {
      html += recent.map(recRow).join("");
    }

    html += '<div style="height:8px"></div>';
    return html;
  }

  function cardToday(s, f, race) {
    var c = TYPE[s.type] || TYPE.easy;
    var chipClass = c.color === "dim" ? "line" : c.color;
    var paceTxt = s.paceLo ? fmtPace(s.paceLo) + "~" + fmtPace(s.paceHi) + " /km" : "—";
    var hrTxt = s.hrs ? s.hrs[0] + "~" + s.hrs[1] + " bpm" : "—";
    var html = '<div class="card today">' +
      '<div class="today-head">' +
      '<div><span class="chip ' + chipClass + '">' + c.label + "</span>" +
      (s.adjusted ? ' <span class="chip amber">컨디션 반영</span>' : "") +
      (s.consecutive ? ' <span class="chip red">연속 러닝 주의</span>' : "") +
      '<h3>' + esc(s.title || c.label) + "</h3>" +
      '<p class="small muted">' + (s.km ? fmtKm(s.km) + "km · " : "") + "RPE " + (s.rpe || "–") + "</p></div>" +
      '<button class="check ' + (s.done ? "on" : "") + '" data-act="done|' + race.id + "|" + s.date + '" aria-label="완료 체크">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>' +
      "</button></div>";

    if (s.paceLo) {
      html += '<div class="session-facts">' +
        '<div class="fact"><span class="lbl">목표 페이스</span><b>' + paceTxt + "</b></div>" +
        '<div class="fact"><span class="lbl">심박</span><b>' + hrTxt + "</b></div>" +
        '<div class="fact"><span class="lbl">거리</span><b>' + fmtKm(s.km) + " km</b></div>" +
        "</div>";
    }
    if (s.detail) html += '<p class="tiny" style="margin-top:8px">' + esc(s.detail) + "</p>";
    if (s.tip) html += tipBlock(s);
    if (s.routine) html += routineBlock(s);
    if (s.why) html += '<div class="why"><b>코치 한마디</b> · ' + esc(s.why) + "</div>";
    if (s.consecutive) {
      html += '<div class="warnbox"><b>연속 러닝 주의</b> — ' + esc(s.consecutiveNote) + "</div>";
    }
    if (f.knee || f.fatigue) {
      html += '<div class="warnbox"><b>' + (f.knee ? "무릎 뻐근함" : "피로 누적") + " 감지</b> — 최근 기록에 '" +
        (f.knee ? "무릎 뻐근함" : "피로 누적") + "' 체크가 있어 이번 주 강도 훈련을 회복런으로 낮췄습니다. 예상 기록도 " +
        (Math.round((f.eq10 / (f.raw || f.eq10) - 1) * 1000) / 10) + "% 보수적으로 계산했어요.</div>";
    }
    html += '<div class="btn-row" style="margin-top:12px">' +
      '<button class="btn primary" data-act="tab|add">기록 추가</button>' +
      '<button class="btn" data-act="tab|plan">주간 계획</button>' +
      "</div></div>";
    return html;
  }

  /* 휴식·보강 루틴 · 장거리 팁 블록 */
  function routineBlock(s, compact) {
    if (!s.routine || !s.routine.length) return "";
    return '<div class="routine' + (compact ? " compact" : "") + '">' +
      '<div class="rt-head">중둔근 · 코어 보강 <span>무릎 보호 루틴</span></div>' +
      s.routine.map(function (r) {
        return '<div class="rt-item"><b>' + esc(r.name) + '</b><span>' + esc(r.spec) + "</span></div>";
      }).join("") +
      (s.caution ? '<div class="rt-caution">' + esc(s.caution) + "</div>" : "") +
      "</div>";
  }

  function tipBlock(s, compact) {
    if (!s.tip) return "";
    return '<div class="tip' + (compact ? " compact" : "") + '"><b>장거리 팁</b> · ' + esc(s.tip) + "</div>";
  }

  function recRow(r) {
    var cond = { good: ["좋음", "lime"], normal: ["보통", "line"], knee: ["무릎 뻐근", "amber"], fatigue: ["피로", "red"] }[r.condition] || ["보통", "line"];
    var pace = r.durationSec / r.distanceKm;
    var diag = diagnoseRun(r);
    return '<div class="rec">' +
      '<div class="badge"><b>' + fromISO(r.date).getDate() + "</b><span>" + (fromISO(r.date).getMonth() + 1) + "월</span></div>" +
      '<div class="grow">' +
      '<div class="row-between"><div class="km num">' + fmtKm(r.distanceKm) + ' km <span class="small dim" style="font-weight:500">' + fmtTime(r.durationSec) + " · " + fmtPace(pace) + "</span></div>" +
      '<span class="chip ' + cond[1] + '">' + cond[0] + "</span></div>" +
      '<div class="meta">' + (r.avgHr ? "심박 " + r.avgHr + "bpm" : "") + (r.cadence ? " · " + r.cadence + "spm" : "") + (r.source === "sample" ? " · 샘플" : r.source === "ai" ? " · AI 추출" : r.source === "ocr" ? " · OCR 인식" : "") + "</div>" +
      (r.memo ? '<div class="memo">' + esc(r.memo) + "</div>" : "") +
      diagChips(diag) +
      '<div class="coach">' + esc(coachNote(r, diag)) + "</div>" +
      diagBlocks(diag) +
      '<div class="rec-actions" style="margin-top:6px"><button class="mini-btn" data-act="editRun|' + r.id + '">수정</button><button class="mini-btn" data-act="delRun|' + r.id + '">삭제</button></div>' +
      "</div></div>";
  }

  /* ------------------------------ 기록 추가 ------------------------------ */
  function viewAdd(race) {
    var s = state.settings;
    var hasKey = !!s.apiKey && s.provider !== "none";
    var d = draft;
    var html = '<h1>기록 추가</h1><p class="small dim" style="margin-bottom:14px">삼성헬스 캡처를 올리면 숫자를 자동으로 읽어 채워줍니다.</p>';

    html += '<div class="card">';
    if (d.image) {
      html += '<div class="thumb-wrap"><img class="thumb" src="' + d.image + '" alt="업로드한 캡처">' +
        '<div class="thumb-info"><div class="row" style="gap:6px"><span class="chip lime">캡처 선택됨</span></div>' +
        '<p class="fname" style="margin-top:6px">' + esc(d.imageName) + "</p>" +
        '<div class="btn-row" style="margin-top:10px"><button class="btn sm" data-act="pickImage">다시 선택</button>' +
        '<button class="btn sm ghost" data-act="clearImage">제거</button></div></div></div>';
    } else {
      html += '<div class="drop"><div class="ico">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M4 17l5-5 4 4 3-3 4 4"/></svg></div>' +
        '<div><strong>삼성헬스 캡처 올리기</strong></div>' +
        '<p class="tiny">갤럭시: 전원+볼륨다운으로 캡처 후 선택하세요.</p>' +
        '<button class="btn primary sm" data-act="pickImage">이미지 선택</button></div>';
    }

    if (hasKey) {
      html += '<p class="tiny" style="margin-top:10px">' + (s.provider === "claude" ? "Claude" : "OpenAI") + " Vision으로 날짜·거리·시간·페이스·심박·케이던스를 자동 추출합니다. 키 호출이 실패하면 내장 무료 OCR로 자동 전환됩니다.</p>";
    } else {
      html += '<div class="note" style="margin-top:10px"><b>무료 OCR이 기본으로 켜져 있어요.</b><br>캡처를 고르면 브라우저 안에서 바로 숫자를 읽어 폼을 채웁니다(서버·API 키 불필요). 못 읽은 칸만 손으로 고치면 되고, 저장하면 계획이 다시 짜입니다.</div>' +
        '<button class="btn sm block" style="margin-top:10px" data-act="demoParse">샘플 삼성헬스 캡처로 인식 체험</button>';
    }

    if (d.busy) {
      html += '<div class="ai-box" style="margin-top:10px;display:flex;gap:9px;align-items:center"><span class="spinner"></span><span>' + esc(d.status || "캡처 분석 중…") + "</span></div>";
    } else if (d.error) {
      html += '<div class="ai-box" style="margin-top:10px;border-color:rgba(255,107,107,.3);background:rgba(255,107,107,.07);color:#ffd0d0"><b>인식 실패</b> · ' + esc(d.error) + '<br><span class="tiny">캡처를 다시 올리거나 아래 폼에 숫자를 직접 입력하세요.</span></div>';
    } else if (d.analysis) {
      var a = d.analysis;
      if (a.ocr) {
        html += ocrResultCard(a);
      } else {
        html += '<div class="ai-box" style="margin-top:10px"><span class="lbl">' + (a.demo ? "샘플 체험 모드 · AI 키 없이 미리보기" : "AI 추출 완료") + "</span>" +
          "날짜 <b>" + a.date + "</b> · 거리 <b>" + fmtKm(a.distanceKm) + "km</b> · 시간 <b>" + fmtTime(a.durationSec) + "</b> · 평균 페이스 <b>" +
          fmtPace(a.durationSec / a.distanceKm) + "</b>" + (a.avgHr ? " · 심박 <b>" + a.avgHr + "bpm</b>" : "") + (a.cadence ? " · 케이던스 <b>" + a.cadence + "spm</b>" : "");
        if (a.coach) html += '<br><span style="display:block;margin-top:6px">"' + esc(a.coach) + '"</span>';
        html += "</div>";
      }
    }
    html += "</div>";

    /* 폼 */
    html += '<div class="card" style="margin-top:12px"><div class="form">' +
      '<div class="grid-2">' +
      field("날짜", '<input type="date" id="f-date" data-field="date" value="' + esc(d.date) + '">') +
      field("거리 (km)", '<input type="number" inputmode="decimal" step="0.01" min="0" id="f-km" data-field="km" placeholder="8.35" value="' + esc(d.km) + '">') +
      "</div>" +
      '<div class="grid-2">' +
      field("시간 (분:초)", '<input type="text" inputmode="numeric" id="f-time" data-field="time" placeholder="49:52" value="' + esc(d.time) + '">') +
      field("평균 심박 (bpm)", '<input type="number" inputmode="numeric" id="f-hr" data-field="hr" placeholder="141" value="' + esc(d.hr) + '">') +
      "</div>" +
      '<div class="pace-live"><span>자동 계산 페이스</span><b id="pacePreview">—</b></div>' +
      field("케이던스 (spm)", '<input type="number" inputmode="numeric" id="f-cad" data-field="cadence" placeholder="168" value="' + esc(d.cadence) + '">') +
      '<div class="field"><label>컨디션</label><div class="segmented">' +
      segBtn("good", "좋음", "회복 양호", d.condition) +
      segBtn("normal", "보통", "무난", d.condition) +
      segBtn("knee", "무릎 뻐근함", "강도 자동 하향", d.condition, "warn") +
      segBtn("fatigue", "피로 누적", "강도 자동 하향", d.condition, "red") +
      "</div></div>" +
      '<div class="field"><label>메모 (선택)</label><textarea id="f-memo" data-field="memo" placeholder="예: 탄천 숯내교 왕복, 후반에 다리가 무거웠음">' + esc(d.memo) + "</textarea></div>" +
      '<button class="btn primary block" data-act="saveRun">' + (d.editingId ? "기록 수정 저장" : "저장하고 계획 다시 계산") + "</button>" +
      (d.editingId ? '<button class="btn ghost block" data-act="cancelEdit">수정 취소</button>' : "") +
      "</div></div>";

    /* 기록 목록 */
    var list = state.runs.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    html += '<div class="sec-title"><h2>저장된 기록 ' + list.length + "건</h2><span class=\"more\">" + fmtKm(list.reduce(function (a, r) { return a + r.distanceKm; }, 0)) + "km</span></div>";
    html += list.length ? list.map(recRow).join("") : '<div class="empty">기록이 없습니다.</div>';
    html += '<input type="file" id="shotInput" accept="image/*" class="hidden">';
    return html;
  }

  function field(label, inner) {
    return '<div class="field"><label>' + label + "</label>" + inner + "</div>";
  }
  function segBtn(val, label, sub, cur, cls) {
    return '<button class="seg ' + (cls || "") + (cur === val ? " on" : "") + '" data-act="cond|' + val + '">' + label + "<span>" + sub + "</span></button>";
  }

  function syncPacePreview() {
    var el = document.getElementById("pacePreview");
    if (!el) return;
    var km = parseFloat(draft.km), t = parseTimeInput(draft.time);
    el.textContent = km > 0 && t > 0 ? fmtPace(t / km) + " /km" : "—";
  }

  /* ------------------------------ 훈련 일정 ------------------------------ */
  function viewPlan(race) {
    if (!race) return '<div class="empty">대회를 먼저 추가해 주세요.<br><br><button class="btn primary sm" data-act="tab|settings">설정으로</button></div>';
    var f = fitness();
    var plan = cachedPlan();
    var doneCount = plan.days.filter(function (d) { return d.done; }).length;
    var runDays = plan.days.filter(function (d) { return d.type !== "rest"; });
    if (!plan.days.length) {
      return '<h1>훈련 일정</h1><p class="small dim" style="margin-bottom:14px">' + esc(race.name) + "</p>" +
        '<div class="empty">이 대회는 이미 지나 계획이 없어요.<br>설정에서 새 대회를 추가하면 오늘부터 다시 짜드립니다.<br><br>' +
        '<button class="btn primary sm" data-act="tab|settings">대회 추가하기</button></div>';
    }

    var html = '<h1>훈련 일정</h1>' +
      '<p class="small dim" style="margin-bottom:12px">' + fullDateKo(race.date) + " · " + distLabel(race.distance) + " · 목표 " + fmtTime(race.goalSec) + "</p>";

    /* 대회 선택 */
    if (state.races.length > 1) {
      html += '<div class="legend" style="margin-bottom:10px">' + state.races.map(function (r) {
        return '<button class="chip ' + (r.id === race.id ? "lime" : "line") + '" data-act="setRace|' + r.id + '">' + esc(r.name.slice(0, 18)) + " · D-" + daysBetween(todayISO(), r.date) + "</button>";
      }).join("") + "</div>";
    }

    html += '<div class="card flat"><div class="row-between">' +
      '<div><span class="chip lime">주간 계획</span><h3 style="margin-top:6px">' + doneCount + " / " + runDays.length + ' 세션 완료</h3>' +
      '<p class="tiny" style="margin-top:2px">주 ' + fmtKm(plan.weeks[0] ? plan.weeks[0].km : 0) + "km · " + plan.days.length + "일 계획</p></div>" +
      '<div class="center"><span class="tiny">추정 10K</span><div class="num" style="font-size:20px;font-weight:750">' + fmtTime(f.eq10) + "</div></div>" +
      "</div>";
    if (f.flag) {
      html += '<div class="warnbox"><b>' + (f.knee ? "무릎 뻐근함" : "피로 누적") + " 감지</b> — 이번 주 인터벌·템포·LSD는 회복런으로 자동 대체했습니다. (다음 주부터 원래 강도로 복귀)</div>";
    }
    html += "</div>";

    plan.weeks.forEach(function (w) {
      html += '<div class="week-head"><h3>' + w.label + "  ·  " + mdKo(w.start) + " ~ " + mdKo(w.end) + '</h3><span class="km">' + fmtKm(w.km) + " km</span></div>";
      html += w.days.map(function (d) { return dayRow(d, race); }).join("");
    });

    html += '<p class="tiny" style="margin:10px 0 20px">페이스 구간과 거리는 현재 추정 실력(' + fmtPace(f.pace) + "/km)과 목표 기록에서 자동 계산됩니다. 기록을 추가하면 즉시 다시 계산돼요.</p>";
    return html;
  }

  function dayRow(d, race) {
    var c = TYPE[d.type] || TYPE.easy;
    var chip = c.color === "dim" ? "line" : c.color;
    var cls = ["day"];
    if (d.isPast) cls.push("past");
    if (d.done) cls.push("done");
    if (d.type === "rest") cls.push("rest");
    if (d.isToday) cls.push("today-day");
    var wdCls = d.wd === 0 ? "sun" : d.wd === 6 ? "sat" : "";
    var other = state.races.filter(function (r) { return r.id !== race.id && r.date === d.date; })[0];
    var meta = [];
    if (d.km) meta.push(fmtKm(d.km) + "km");
    if (d.paceLo) meta.push(fmtPace(d.paceLo) + "~" + fmtPace(d.paceHi) + "/km");
    if (d.hrs) meta.push("심박 " + d.hrs[0] + "~" + d.hrs[1]);
    return '<div class="' + cls.join(" ") + '">' +
      '<div class="datecol"><span class="wd ' + wdCls + '">' + WD[d.wd] + '</span><span class="dnum">' + fromISO(d.date).getDate() + "</span></div>" +
      '<div class="day-main">' +
      '<div class="day-title"><span class="chip ' + chip + '">' + c.label + "</span>" +
      (d.isToday ? '<span class="chip lime">오늘</span>' : "") +
      (d.adjusted ? '<span class="chip amber">컨디션 반영</span>' : "") +
      (d.consecutive ? '<span class="chip red">연속 러닝 주의</span>' : "") +
      (other ? '<span class="chip violet">다른 대회</span>' : "") +
      "</div>" +
      (d.title && d.title !== c.label ? '<div class="day-title" style="margin-top:5px"><strong>' + esc(d.title) + "</strong></div>" : "") +
      (meta.length ? '<div class="day-meta">' + meta.join(" · ") + "</div>" : "") +
      (d.detail ? '<div class="day-detail">' + esc(d.detail) + "</div>" : "") +
      (d.tip ? tipBlock(d, true) : "") +
      (d.routine ? routineBlock(d, true) : "") +
      (d.consecutive ? '<div class="day-warn">' + esc(d.consecutiveNote) + "</div>" : "") +
      (d.why ? '<div class="day-why">' + esc(d.why) + "</div>" : "") +
      "</div>" +
      (d.type === "rest" ? "" :
        '<button class="check ' + (d.done ? "on" : "") + '" data-act="done|' + race.id + "|" + d.date + '" aria-label="완료">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></button>') +
      "</div>";
  }

  /* ------------------------------ 대회 · 설정 ------------------------------ */
  function viewSettings(race) {
    var s = state.settings;
    var html = '<h1>대회 · 설정</h1><p class="small dim" style="margin-bottom:14px">목표 대회와 AI 코치 연결을 관리합니다.</p>';

    /* 대회 목록 */
    html += '<div class="sec-title" style="margin-top:0"><h2>내 대회</h2><span class="more">' + state.races.length + "개</span></div>";
    if (!state.races.length) {
      html += '<div class="empty">등록된 대회가 없습니다. 아래에서 추가하세요.</div>';
    } else {
      html += state.races.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).map(function (r) {
        var dday = daysBetween(todayISO(), r.date);
        return '<div class="race-card ' + (r.id === state.activeRaceId ? "active" : "") + '">' +
          '<div class="grow"><div class="nm">' + esc(r.name) + "</div>" +
          '<div class="sub">' + fullDateKo(r.date) + " · " + distLabel(r.distance) + " · 목표 " + fmtTime(r.goalSec) + "</div>" +
          '<div class="row" style="margin-top:7px;gap:5px">' +
          '<span class="chip ' + (r.id === state.activeRaceId ? "lime" : "line") + '">' + (dday >= 0 ? "D-" + dday : "종료") + "</span>" +
          (r.id === state.activeRaceId ? "" : '<button class="mini-btn" data-act="setRace|' + r.id + '">대표로</button>') +
          '<button class="mini-btn" data-act="editRace|' + r.id + '">수정</button>' +
          '<button class="mini-btn" data-act="delRace|' + r.id + '">삭제</button>' +
          "</div></div></div>";
      }).join("");
    }

    /* 대회 추가/수정 */
    html += '<div class="card" style="margin-top:12px"><h3 style="margin-bottom:10px" id="raceFormTitle">새 대회 추가</h3>' +
      '<div class="form">' +
      '<div class="field"><label>대회명</label><input type="text" id="r-name" placeholder="예: 2027 서울 하프마라톤"></div>' +
      '<div class="grid-2">' +
      '<div class="field"><label>날짜</label><input type="date" id="r-date" value="' + addDays(todayISO(), 30) + '"></div>' +
      '<div class="field"><label>종목</label><select id="r-dist">' +
      '<option value="5">5km</option><option value="10" selected>10km</option><option value="21.0975">하프</option><option value="42.195">풀코스</option></select></div>' +
      "</div>" +
      '<div class="grid-2">' +
      '<div class="field"><label>목표 기록</label><input type="text" id="r-goal" placeholder="50:00" value="50:00"></div>' +
      '<div class="field"><label>출발 시각</label><input type="time" id="r-start" value="09:00"></div>' +
      "</div>" +
      '<div class="field"><label>장소 (선택)</label><input type="text" id="r-place" placeholder="예: 여의도 한강공원"></div>' +
      '<div class="btn-row"><button class="btn primary" data-act="saveRace">저장</button>' +
      '<button class="btn ghost" id="raceCancelBtn" data-act="cancelRaceEdit" style="display:none">취소</button></div>' +
      "</div></div>";

    /* AI 연결 */
    html += '<div class="sec-title"><h2>AI 코치 연동</h2><span class="more">' + (s.apiKey && s.provider !== "none" ? "연결됨" : "선택 사항") + "</span></div>";
    html += '<div class="card"><div class="form">' +
      '<div class="note" style="margin-bottom:4px"><b>캡처 자동 인식은 기본이 무료예요.</b><br>키 없이도 브라우저 내장 OCR(Tesseract.js)이 삼성헬스 캡처의 숫자를 읽어 폼을 채웁니다. 키를 넣으면 Vision이 더 꼼꼼히 읽고 코칭 문장까지 만들어 줍니다(선택).</div>' +
      '<div class="field"><label>제공사</label><div class="pill-toggle">' +
      ['none', 'claude', 'openai'].map(function (p) {
        var lbl = p === "none" ? "사용 안 함" : p === "claude" ? "Claude" : "OpenAI";
        return '<button class="pill ' + (s.provider === p ? "on" : "") + '" data-act="provider|' + p + '">' + lbl + "</button>";
      }).join("") + "</div></div>" +
      '<div class="field"><label>API 키</label><input type="password" id="s-key" placeholder="' + (s.apiKey ? "저장된 키: " + maskKey(s.apiKey) + " (변경하려면 입력)" : "sk-…") + '" autocomplete="off"></div>' +
      '<div class="field"><label>모델</label><input type="text" id="s-model" value="' + esc(s.model) + '" placeholder="' + (s.provider === "openai" ? "gpt-4o-mini" : "claude-sonnet-4-5") + '"></div>' +
      '<div class="btn-row"><button class="btn primary" data-act="saveSettings">저장</button>' +
      (s.apiKey ? '<button class="btn danger" data-act="clearKey">키 삭제</button>' : "") + "</div>" +
      (s.provider === "openai" ? '<p class="tiny">OpenAI는 브라우저 직접 호출 시 응답이 차단(CORS)될 수 있어요. 인식이 실패하면 Claude를 쓰거나 직접 입력하세요.</p>' : "") +
      '<div class="note"><b>키는 이 브라우저(localStorage)에만 저장됩니다.</b><br>중간 서버 없이 브라우저에서 ' +
      (s.provider === "openai" ? "api.openai.com" : "api.anthropic.com") + '로 캡처 이미지와 함께 직접 전송되며, 다른 곳에는 저장·전송되지 않습니다. 공용 기기에서는 사용 후 키를 삭제하세요. 데이터 JSON에는 키가 포함되지 않습니다.</div>' +
      "</div></div>";

    /* 데이터 */
    html += '<div class="sec-title"><h2>데이터</h2><span class="more">기기 저장</span></div>';
    html += '<div class="card"><div class="form">' +
      '<div class="kv"><span>기록</span><span class="num">' + state.runs.length + "건 · " + fmtKm(state.runs.reduce(function (a, r) { return a + r.distanceKm; }, 0)) + " km</span></div>" +
      '<div class="kv"><span>완료 체크</span><span class="num">' + Object.keys(state.done).length + "개</span></div>" +
      '<div class="kv"><span>저장 위치</span><span>이 브라우저 (localStorage)</span></div>' +
      '<div class="btn-row" style="margin-top:6px"><button class="btn" data-act="exportData">JSON 내보내기</button><button class="btn" data-act="importData">불러오기</button></div>' +
      '<button class="btn ghost danger block" data-act="resetAll">모든 데이터 초기화</button>' +
      '<input type="file" id="importInput" accept="application/json" class="hidden">' +
      "</div></div>";

    /* 앱 정보 */
    html += '<div class="sec-title"><h2>앱 정보</h2><span class="more">v' + APP_VERSION + "</span></div>";
    html += '<div class="card"><div class="form">' +
      '<div class="kv"><span>앱 이름</span><span>페이스 코치 (Pace Coach)</span></div>' +
      '<div class="kv"><span>형태</span><span>PWA · 오프라인 지원</span></div>' +
      '<div class="kv"><span>계산 기준</span><span class="num">최대심박 ' + (s.maxHr || 174) + 'bpm</span></div>' +
      '<div class="note"><b>홈 화면에 추가</b><br>Chrome: 우측 상단 ⋮ → "앱 설치" 또는 "홈 화면에 추가". 한 번 설치하면 인터넷 없이도 열립니다.</div>' +
      '<p class="tiny">프리셋 기록은 탄천 러닝과 12월 두 대회 일정을 바탕으로 넣어두었습니다. 기록 탭에서 수정·삭제하거나 아래에서 초기화할 수 있어요.</p>' +
      "</div></div>";
    html += '<div style="height:12px"></div>';
    return html;
  }

  function maskKey(k) {
    if (!k) return "";
    if (k.length <= 10) return "••••";
    return k.slice(0, 6) + "…" + k.slice(-4);
  }

  /* ------------------------------------------------------------------ *
   *  토스트
   * ------------------------------------------------------------------ */
  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  function toast(msg) {
    toastEl.innerHTML = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 4200);
  }

  /* ------------------------------------------------------------------ *
   *  이벤트
   * ------------------------------------------------------------------ */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el) return;
    var parts = el.getAttribute("data-act").split("|");
    var act = parts[0], arg = parts[1], arg2 = parts[2];

    switch (act) {
      case "tab":
        state.tab = arg;
        save();
        render();
        break;
      case "done":
        var key = arg + ":" + arg2;
        if (state.done[key]) delete state.done[key];
        else state.done[key] = true;
        save();
        render();
        if (state.done[key]) toast("완료 표시했어요. 이번 주 계획에 반영했습니다.");
        break;
      case "pickImage":
        var input = document.getElementById("shotInput");
        if (input) input.click();
        break;
      case "clearImage":
        draft.image = null;
        draft.imageName = "";
        draft.analysis = null;
        draft.error = "";
        render();
        break;
      case "demoParse":
        runDemoParse();
        break;
      case "retryOcr":
        var ss = state.settings;
        if (draft.image && ss.apiKey && ss.provider !== "none") analyzeImage(draft.image, "image/png");
        else runFreeOcr();
        break;
      case "cond":
        draft.condition = arg;
        render();
        break;
      case "saveRun":
        saveRun();
        break;
      case "editRun":
        editRun(arg);
        break;
      case "delRun":
        delRun(arg);
        break;
      case "cancelEdit":
        draft = newDraft();
        render();
        break;
      case "setRace":
        state.activeRaceId = arg;
        save();
        render();
        toast("대표 대회를 <b>" + esc((state.races.filter(function (r) { return r.id === arg; })[0] || {}).name || "") + "</b>로 바꿨어요.");
        break;
      case "saveRace":
        saveRace();
        break;
      case "editRace":
        editRace(arg);
        break;
      case "delRace":
        delRace(arg);
        break;
      case "cancelRaceEdit":
        resetRaceForm();
        break;
      case "provider":
        state.settings.provider = arg;
        save();
        render();
        break;
      case "saveSettings":
        saveSettings();
        break;
      case "clearKey":
        state.settings.apiKey = "";
        state.settings.provider = "none";
        save();
        render();
        toast("API 키를 삭제했어요. 이제 수기 입력 모드로 동작합니다.");
        break;
      case "exportData":
        exportData();
        break;
      case "importData":
        var imp = document.getElementById("importInput");
        if (imp) imp.click();
        break;
      case "resetAll":
        if (confirm("모든 기록·대회·설정을 초기 상태로 되돌립니다. 계속할까요?")) {
          localStorage.removeItem(LS_KEY);
          state = defaultState();
          draft = newDraft();
          save();
          render();
          toast("초기 상태로 되돌렸어요. 샘플 기록 3건과 12월 대회 2개가 다시 들어갔습니다.");
        }
        break;
    }
  });

  document.addEventListener("input", function (e) {
    var el = e.target;
    if (!el || !el.getAttribute) return;
    var f = el.getAttribute("data-field");
    if (!f) return;
    draft[f] = el.value;
    if (f === "km" || f === "time") syncPacePreview();
  });

  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el.id === "shotInput") {
      var file = el.files && el.files[0];
      if (file) handleImage(file);
    } else if (el.id === "importInput") {
      var f2 = el.files && el.files[0];
      if (f2) importData(f2);
    }
  });

  /* ------------------------------------------------------------------ *
   *  이미지 처리 · AI 분석
   * ------------------------------------------------------------------ */
  function fileToDataURL(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }

  function handleImage(file) {
    draft.image = null;
    draft.analysis = null;
    draft.error = "";
    draft.ocrFallback = false;
    draft.imageName = file.name || "capture.png";
    fileToDataURL(file).then(function (dataUrl) {
      draft.image = dataUrl;
      draft.imageSet = true;
      render();
      var s = state.settings;
      if (s.apiKey && s.provider !== "none") {
        // 키가 있으면 Vision, 실패하면 아래 analyzeImage가 무료 OCR로 넘긴다
        analyzeImage(dataUrl, file.type || "image/png");
      } else {
        runFreeOcr();
      }
    }).catch(function () {
      draft.error = "이미지를 읽지 못했어요.";
      render();
    });
  }

  var ANALYSIS_PROMPT = [
    "너는 한국 러닝 앱의 데이터 추출기다. 첨부된 삼성헬스(또는 러닝 앱) 운동 기록 캡처에서 값을 읽어라.",
    "반드시 아래 키만 가진 JSON 하나만 출력하고, 설명·코드블록 없이 JSON만 써라.",
    '{ "date": "YYYY-MM-DD", "distanceKm": 숫자, "durationSec": 초단위숫자, "avgPaceSec": 초/km숫자, "avgHr": 숫자또는null, "cadence": 숫자또는null, "confidence": "high|mid|low", "coach": "한국어 코칭 2문장" }',
    "규칙: 시간은 반드시 초로 환산(예 49:52 -> 2992). 페이스는 초/km(예 5'58\" -> 358). 값이 안 보이면 null. coach는 데이터에 근거해 2문장, 반말체 코치 톤으로."
  ].join("\n");

  async function analyzeImage(dataUrl, mime) {
    var s = state.settings;
    draft.busy = true;
    draft.status = "캡처에서 숫자를 읽는 중…";
    draft.error = "";
    render();
    try {
      var base64 = dataUrl.split(",")[1];
      var text;
      if (s.provider === "claude") {
        var modelC = s.model || "claude-sonnet-4-5";
        var r1 = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": s.apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: modelC,
            max_tokens: 800,
            messages: [{
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: mime, data: base64 } },
                { type: "text", text: ANALYSIS_PROMPT }
              ]
            }]
          })
        });
        if (!r1.ok) throw new Error(await apiError(r1));
        var j1 = await r1.json();
        text = (j1.content || []).map(function (c) { return c.text || ""; }).join("\n");
      } else {
        var modelO = s.model || "gpt-4o-mini";
        var r2 = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer " + s.apiKey },
          body: JSON.stringify({
            model: modelO,
            max_tokens: 800,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: ANALYSIS_PROMPT },
                { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
              ]
            }]
          })
        });
        if (!r2.ok) throw new Error(await apiError(r2));
        var j2 = await r2.json();
        text = (((j2.choices || [])[0] || {}).message || {}).content || "";
      }
      var parsed = parseJsonLoose(text);
      if (!parsed || !(parsed.distanceKm > 0)) throw new Error("캡처에서 거리 값을 찾지 못했어요.");
      applyAnalysis(parsed);
      draft.busy = false;
      draft.status = "";
      render();
      toast("캡처에서 " + fmtKm(parsed.distanceKm) + "km를 읽었어요. 컨디션만 골라 저장하세요.");
    } catch (err) {
      draft.busy = false;
      draft.status = "";
      var msg = (err && err.message) || String(err);
      if (err && err.name === "TypeError") {
        msg = "요청이 브라우저에서 차단됐어요 (네트워크/CORS). 키·모델을 확인하고, 계속 실패하면 아래 폼에 직접 입력해 주세요.";
      }
      draft.error = msg;
      render();
      // 키 호출이 막혔을 때(키 오류·CORS·한도)는 무료 OCR로 한 번 더 시도한다
      if (draft.image && !draft.ocrFallback) {
        draft.ocrFallback = true;
        toast("Vision 호출이 실패해 내장 무료 OCR로 다시 읽어볼게요.");
        runFreeOcr();
      }
    }
  }

  async function apiError(res) {
    var body = "";
    try { body = (await res.text()).slice(0, 300); } catch (e) { }
    if (res.status === 401 || res.status === 403) return "키가 거부되었습니다 (HTTP " + res.status + "). 설정에서 키를 확인하세요.";
    if (res.status === 404) return "모델 이름을 찾을 수 없습니다 (HTTP 404). 설정의 모델명을 확인하세요.";
    if (res.status === 429) return "요청 한도/잔액 초과 (HTTP 429).";
    return "HTTP " + res.status + " · " + body.replace(/\s+/g, " ").slice(0, 160);
  }

  function parseJsonLoose(text) {
    if (!text) return null;
    var t = String(text).replace(/```json/gi, "").replace(/```/g, "").trim();
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a === -1 || b === -1) return null;
    try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
  }

  function applyAnalysis(a) {
    draft.analysis = a;
    if (a.date) draft.date = a.date;
    if (a.distanceKm) draft.km = String(Math.round(a.distanceKm * 100) / 100);
    var dur = a.durationSec;
    if (!dur && a.distanceKm && a.avgPaceSec) dur = a.distanceKm * a.avgPaceSec;
    if (dur) draft.time = fmtTime(dur);
    if (a.avgHr) draft.hr = String(Math.round(a.avgHr));
    if (a.cadence) draft.cadence = String(Math.round(a.cadence));
  }

  /* ------------------------------------------------------------------ *
   *  무료 내장 OCR (Tesseract.js) · 삼성헬스 캡처 파서
   *  - API 키 없이 브라우저 안에서만 동작합니다.
   *  - 숫자·단위(km, bpm, spm, kcal, mm:ss, m'ss")를 읽어 폼을 채웁니다.
   * ------------------------------------------------------------------ */
  var TESS_VERSION = "5";
  var TESS_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@" + TESS_VERSION + "/dist/tesseract.min.js";
  var TESS_DIST = "https://cdn.jsdelivr.net/npm/tesseract.js@" + TESS_VERSION + "/dist/";
  var TESS_CORE = "https://cdn.jsdelivr.net/npm/tesseract.js-core@" + TESS_VERSION;
  var ocrWorkerPromise = null;
  var ocrProgressCb = null;
  var ocrSeq = 0;

  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      if (window.Tesseract) return resolve();
      var old = document.querySelector('script[data-ocr-src="' + src + '"]');
      if (old) {
        old.addEventListener("load", function () { resolve(); });
        old.addEventListener("error", function () { reject(new Error("OCR 엔진을 내려받지 못했어요. 네트워크를 확인해 주세요.")); });
        return;
      }
      var sc = document.createElement("script");
      sc.src = src;
      sc.async = true;
      sc.setAttribute("data-ocr-src", src);
      sc.onload = function () { resolve(); };
      sc.onerror = function () {
        if (sc.parentNode) sc.parentNode.removeChild(sc);
        reject(new Error("OCR 엔진을 내려받지 못했어요. 네트워크를 확인해 주세요."));
      };
      document.head.appendChild(sc);
    });
  }

  function getOcrWorker() {
    if (ocrWorkerPromise) return ocrWorkerPromise;
    ocrWorkerPromise = loadScriptOnce(TESS_SRC).then(function () {
      if (!window.Tesseract || !window.Tesseract.createWorker) throw new Error("OCR 엔진을 초기화하지 못했어요.");
      return window.Tesseract.createWorker("eng", 1, {
        workerPath: TESS_DIST + "worker.min.js",
        corePath: TESS_CORE,
        logger: function (m) { if (typeof ocrProgressCb === "function") ocrProgressCb(m); },
        errorHandler: function (e) { if (window.console) console.warn("[OCR]", e && e.message ? e.message : e); }
      });
    }).then(function (worker) {
      return worker.setParameters({ preserve_interword_spaces: "1", user_defined_dpi: "300" }).then(function () { return worker; });
    });
    ocrWorkerPromise.catch(function () { ocrWorkerPromise = null; });
    return ocrWorkerPromise;
  }

  function ocrStatusLabel(m) {
    var st = (m && m.status) || "";
    if (st === "loading tesseract core" || st === "loading tesseract.js core") return "OCR 엔진 준비 중…";
    if (st === "initializing tesseract" || st === "initializing tesseract.js") return "OCR 엔진 초기화 중…";
    if (st === "loading language traineddata") return "글자 인식 데이터 내려받는 중… (첫 1회만)";
    if (st === "initializing api") return "인식기 초기화 중…";
    if (st === "recognizing text") return "삼성헬스 화면에서 숫자 읽는 중… " + Math.round((m.progress || 0) * 100) + "%";
    return "삼성헬스 화면에서 숫자 읽는 중…";
  }

  /* --- 이미지 전처리: 2~4배 업스케일 · 흑백 · 대비 강조 · 다크 화면 반전 --- */
  function preprocessCapture(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try { resolve(buildOcrCanvases(img)); } catch (e) { reject(e); }
      };
      img.onerror = function () { reject(new Error("이미지를 열지 못했어요.")); };
      img.src = dataUrl;
    });
  }

  function histQuantile(hist, total, q) {
    var target = total * q, acc = 0;
    for (var i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= target) return i;
    }
    return 255;
  }

  function otsuThreshold(hist, total) {
    var sum = 0, i;
    for (i = 0; i < 256; i++) sum += i * hist[i];
    var sumB = 0, wB = 0, best = -1, thr = 128;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      var wF = total - wB;
      if (!wF) break;
      sumB += i * hist[i];
      var mB = sumB / wB, mF = (sum - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = i; }
    }
    return thr;
  }

  function buildOcrCanvases(img) {
    var w = img.naturalWidth || img.width || 1;
    var h = img.naturalHeight || img.height || 1;
    var longSide = Math.max(w, h);
    // 작은 캡처는 크게 키우고(최대 4배), 이미 큰 캡처는 그대로 둔다(긴 변 1800px 기준)
    var scale = Math.max(1, Math.min(4, 1800 / longSide));
    var cw = Math.max(1, Math.round(w * scale));
    var ch = Math.max(1, Math.round(h * scale));
    var cv = document.createElement("canvas");
    cv.width = cw; cv.height = ch;
    var ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, cw, ch);
    var src = ctx.getImageData(0, 0, cw, ch);
    var px = src.data;
    var n = cw * ch;
    var gray = new Uint8ClampedArray(n);
    var sum = 0, i, j;
    for (i = 0, j = 0; j < n; i += 4, j++) {
      var g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
      gray[j] = g;
      sum += g;
    }
    var mean = sum / n;
    var inverted = mean < 112;            // 다크 모드 캡처는 흑백 반전
    var histIn = new Uint32Array(256);
    for (j = 0; j < n; j++) {
      if (inverted) gray[j] = 255 - gray[j];
      histIn[Math.round(gray[j])]++;
    }
    var lo = histQuantile(histIn, n, 0.02), hi = histQuantile(histIn, n, 0.98);
    if (hi - lo < 45) { lo = 0; hi = 255; }
    var span = hi - lo || 1;
    var histOut = new Uint32Array(256);
    for (j = 0; j < n; j++) {
      var v = (gray[j] - lo) * 255 / span;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      gray[j] = v;
      histOut[Math.round(v)]++;
    }

    var out = document.createElement("canvas");
    out.width = cw; out.height = ch;
    var octx = out.getContext("2d");
    var grayData = octx.createImageData(cw, ch);
    for (j = 0; j < n; j++) {
      var gv = gray[j];
      grayData.data[j * 4] = gv;
      grayData.data[j * 4 + 1] = gv;
      grayData.data[j * 4 + 2] = gv;
      grayData.data[j * 4 + 3] = 255;
    }
    octx.putImageData(grayData, 0, 0);
    var grayUrl = out.toDataURL("image/png");

    // 날짜가 안 읽힐 때 다시 볼 상단 영역(날짜·거리 줄)
    var cropH = Math.max(1, Math.round(ch * 0.4));
    var topCv = document.createElement("canvas");
    topCv.width = cw;
    topCv.height = cropH;
    var tctx = topCv.getContext("2d");
    tctx.drawImage(out, 0, 0, cw, cropH, 0, 0, cw, cropH);
    var topUrl = topCv.toDataURL("image/png");

    var thr = otsuThreshold(histOut, n);
    for (j = 0; j < n; j++) {
      var bv = gray[j] <= thr ? 0 : 255;
      grayData.data[j * 4] = bv;
      grayData.data[j * 4 + 1] = bv;
      grayData.data[j * 4 + 2] = bv;
      grayData.data[j * 4 + 3] = 255;
    }
    octx.putImageData(grayData, 0, 0);
    var binUrl = out.toDataURL("image/png");

    return { gray: grayUrl, binary: binUrl, top: topUrl, width: cw, height: ch, scale: scale, inverted: inverted };
  }

  /* --- OCR 결과 → 토큰(단어) --- */
  function normOcrText(s) {
    var t = String(s == null ? "" : s);
    t = t.replace(/[\u2018\u2019\u00b4`\u2032]/g, "'").replace(/[\u201c\u201d\u2033]/g, '"');
    t = t.replace(/\s+/g, " ").trim();
    // 숫자와 헷갈리기 쉬운 글자만 보정 (O→0, l/I→1, S→5, B→8, Z→2)
    if (/\d/.test(t) && /^[0-9OoIlSsBbZzGg.,:'"]+$/.test(t)) {
      t = t.replace(/[Oo]/g, "0").replace(/[Il]/g, "1").replace(/[Ss]/g, "5").replace(/[Bb]/g, "8").replace(/[Zz]/g, "2").replace(/G/g, "6");
    }
    return t;
  }

  function collectOcrChunks(data) {
    var chunks = [];
    function add(w, lineText) {
      if (!w || !w.text) return;
      var t = normOcrText(w.text);
      if (!t) return;
      var bb = w.bbox || {};
      var x0 = bb.x0 || 0, y0 = bb.y0 || 0, x1 = bb.x1 || 0, y1 = bb.y1 || 0;
      chunks.push({
        text: t,
        raw: w.text,
        conf: typeof w.confidence === "number" ? w.confidence : 0,
        x0: x0, y0: y0, x1: x1, y1: y1,
        h: Math.max(1, y1 - y0),
        cy: (y0 + y1) / 2,
        lineText: lineText || ""
      });
    }
    if (data.words && data.words.length) {
      data.words.forEach(function (w) { add(w, ""); });
    } else if (data.blocks) {
      data.blocks.forEach(function (b) {
        (b.paragraphs || []).forEach(function (p) {
          (p.lines || []).forEach(function (l) {
            (l.words || []).forEach(function (w) { add(w, l.text || ""); });
          });
        });
      });
    }
    if (!chunks.length && data.lines) {
      data.lines.forEach(function (l) {
        (l.words || []).forEach(function (w) { add(w, l.text || ""); });
        if (!(l.words && l.words.length) && l.text) {
          // 단어 상자가 없으면 줄 전체를 하나의 덩어리로
          add({ text: l.text, confidence: l.confidence, bbox: l.bbox }, l.text);
        }
      });
    }
    if (!chunks.length && data.text) {
      // 최후 수단: 글자만 있을 때 줄·토큰에 가짜 좌표를 부여
      var y = 0;
      String(data.text).split(/\r?\n/).forEach(function (ln) {
        y += 10;
        var x = 0;
        ln.trim().split(/\s+/).forEach(function (w) {
          var t = normOcrText(w);
          if (!t) return;
          var wd = Math.max(8, t.length * 8);
          chunks.push({ text: t, raw: w, conf: 0, x0: x, y0: y, x1: x + wd, y1: y + 10, h: 10, cy: y + 5, lineText: ln, fallback: true });
          x += wd + 8;
        });
      });
    }
    return chunks;
  }

  function groupOcrLines(chunks) {
    var sorted = chunks.slice().sort(function (a, b) { return a.cy - b.cy; });
    var id = 0, refCy = null, refH = 1;
    sorted.forEach(function (c) {
      if (refCy == null || Math.abs(c.cy - refCy) > Math.max(9, Math.min(c.h, refH) * 0.75)) {
        id++;
        refCy = c.cy;
        refH = c.h;
      } else {
        refCy = (refCy + c.cy) / 2;
        refH = Math.max(refH, c.h);
      }
      c.lineId = id;
    });
    return chunks;
  }

  function unitHit(text, kind) {
    var t = String(text == null ? "" : text).toLowerCase().replace(/[\s.,|]/g, "");
    if (!t) return false;
    if (kind === "km") return /(km|krn|knm|knn)/.test(t);
    if (kind === "bpm") return /(bpm|bpnn|bprn|bom|dpm)/.test(t);
    if (kind === "spm") return /(spm|5pm|spn|spni|sprn)/.test(t);
    if (kind === "kcal") return /(kcal|kca1|kal)/.test(t);
    if (kind === "slashkm") return /(\/km|\/krn|perkm|1km\/)/.test(t);
    return false;
  }

  /* 페이스/시간 등 뒤에 붙은 단위를 같은 줄에서 찾기 */
  function unitNearby(c, kind) {
    if (unitHit(c.text, kind)) return true;
    var limit = Math.max(14, c.h * 2.4);
    for (var i = 0; i < c._all.length; i++) {
      var o = c._all[i];
      if (o === c || o.lineId !== c.lineId) continue;
      var gap = o.x0 - c.x1;
      if (gap < -8 || gap > limit) continue;
      if (unitHit(o.text, kind)) return true;
    }
    return false;
  }

  var OCR_PACE_RE = /^(\d{1,2})\s*['\u2032]\s*(\d{1,2})/;
  var OCR_TIME_RE = /^(\d{1,2})\s*[:;]\s*(\d{1,2})(?:\s*[:;]\s*(\d{1,2}))?$/;

  function parseDateText(text) {
    var t = String(text || "").replace(/\s+/g, " ");
    // 구분자(점·슬래시·공백·하이픈)가 있어야 신뢰한다. 붙어버린 숫자열은 버린다.
    var m = t.match(/(20\d{2})[\s.\-/]{1,3}(\d{1,2})[\s.\-/]{1,3}(\d{1,2})/);
    if (!m) return null;
    return makePastDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
  }

  function makePastDate(y, mo, dy) {
    if (!(y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31)) return null;
    var isoStr = y + "-" + pad(mo) + "-" + pad(dy);
    var gap = daysBetween(todayISO(), isoStr);
    if (gap > 0 || gap < -730) return null;
    return isoStr;
  }

  /* 연도가 있는 줄의 숫자들로 (월, 일)을 골라 “오늘과 가장 가까운 과거”를 택한다.
     삼성헬스 날짜 줄은 한글 라벨 때문에 숫자가 붙어 나오는 경우가 많다. */
  function dateFromLines(chunks) {
    var byLine = {};
    chunks.forEach(function (c) { (byLine[c.lineId] = byLine[c.lineId] || []).push(c); });
    var best = null;
    Object.keys(byLine).forEach(function (id) {
      var group = byLine[id];
      var year = null;
      var nums = [];
      group.forEach(function (c) {
        var ym = c.text.match(/^(20\d{2})/);
        if (ym && !year) year = parseInt(ym[1], 10);
        var rest = ym ? c.text.slice(4) : c.text;
        var runs = rest.match(/\d{1,4}/g) || [];
        runs.forEach(function (r) {
          if (r.length <= 2) nums.push(parseInt(r, 10));
          else if (r.length === 3) { nums.push(parseInt(r.slice(0, 2), 10)); nums.push(parseInt(r.slice(2), 10)); }
        });
      });
      if (!year || nums.length < 2) return;
      for (var i = 0; i < nums.length; i++) {
        for (var j = i + 1; j < nums.length; j++) {
          var cand = makePastDate(year, nums[i], nums[j]);
          if (cand && (!best || cand > best)) best = cand;
        }
      }
    });
    return best;
  }

  function parseHealthCapture(data, imgHeight) {
    var chunks = groupOcrLines(collectOcrChunks(data));
    chunks.forEach(function (c) { c._all = chunks; });
    var H = chunks.length && chunks[0].fallback ? 0 : (imgHeight || 0);
    var p = {
      date: null,
      distanceKm: null,
      durationSec: null,
      avgPaceSec: null,
      avgHr: null,
      cadence: null,
      kcal: null,
      confidence: Math.round(typeof data.confidence === "number" ? data.confidence : 0),
      missing: [],
      text: String(data.text || "").slice(0, 600)
    };

    /* 1) 거리: 큰 숫자 + km (페이스의 /km는 제외) */
    var distBest = null;
    chunks.forEach(function (c) {
      var m = c.text.match(/^(\d{1,3}[.,]\d{1,2}|\d{1,3})\s*(.*)$/);
      if (!m) return;
      var rest = m[2] || "";
      var inline = unitHit(rest, "km") && !unitHit(rest, "slashkm");
      var slash = unitHit(rest, "slashkm") || unitHit(rest, "kcal");
      if (slash) return;
      if (!inline && !(unitNearby(c, "km") && !unitNearby(c, "slashkm"))) return;
      var v = parseFloat(m[1].replace(",", "."));
      if (!(v > 0.2 && v <= 200)) return;
      var score = c.h * (inline ? 1.25 : 1) * (0.55 + Math.min(1, c.conf / 100));
      if (!distBest || score > distBest.score) distBest = { v: v, score: score, c: c };
    });
    if (distBest) p.distanceKm = Math.round(distBest.v * 100) / 100;

    /* 2) 시간/페이스 후보 수집 */
    var timeCands = [];
    chunks.forEach(function (c) {
      var t = c.text;
      var pm = t.match(OCR_PACE_RE);
      var tm = t.match(OCR_TIME_RE);
      var sec = null, isPace = false;
      if (pm) {
        var mm = parseInt(pm[1], 10), ss = parseInt(pm[2], 10);
        if (mm >= 2 && mm <= 20 && ss < 60) { sec = mm * 60 + ss; isPace = true; }
      }
      if (sec == null && tm) {
        var a = parseInt(tm[1], 10), b = parseInt(tm[2], 10), cc = tm[3] != null ? parseInt(tm[3], 10) : null;
        if (b < 60 && (cc == null || cc < 60)) {
          var s2 = cc != null ? a * 3600 + b * 60 + cc : a * 60 + b;
          if (s2 >= 45 && s2 <= 35999) sec = s2;
        }
      }
      if (sec == null) return;
      var lineTxt = (c.lineText || "") + " " + chunks.filter(function (o) { return o.lineId === c.lineId; }).map(function (o) { return o.text; }).join(" ");
      if (!isPace) {
        if (/20\d{2}/.test(lineTxt)) return;                 // 날짜 줄의 시각(예: 9:36)
        if (H && c.cy < H * 0.05 && c.h < H * 0.022) return;  // 상태바 시계
      }
      timeCands.push({ sec: sec, pace: isPace, h: c.h, conf: c.conf, x0: c.x0, c: c });
    });

    var paceCand = timeCands.filter(function (x) { return x.pace; }).sort(function (a, b) {
      return (b.h - a.h) || (b.conf - a.conf);
    })[0] || null;
    var durCands = timeCands.filter(function (x) { return !x.pace; });
    var duration = null;

    if (durCands.length === 1) {
      duration = durCands[0];
    } else if (durCands.length > 1) {
      var pick = null;
      if (distBest && paceCand) {
        // 거리×페이스와 가장 가까운 시간을 고른다
        var target = distBest.v * paceCand.sec;
        durCands.forEach(function (d) {
          var err = Math.abs(d.sec - target) / target;
          if (!pick || err < pick.err) pick = { d: d, err: err };
        });
        if (pick && pick.err > 0.12) pick = null;
      }
      if (!pick && distBest) {
        // 페이스 글자가 안 읽혔을 때: 두 시간값의 조합이 거리와 맞는지 확인
        var bestPair = null;
        durCands.forEach(function (d) {
          durCands.forEach(function (o) {
            if (o === d) return;
            var implied = d.sec / distBest.v;
            var err = Math.abs(implied - o.sec) / Math.max(1, o.sec);
            if (!bestPair || err < bestPair.err) bestPair = { d: d, o: o, err: err };
          });
        });
        if (bestPair && bestPair.err < 0.05) {
          pick = { d: bestPair.d.sec >= bestPair.o.sec ? bestPair.d : bestPair.o, err: bestPair.err };
          if (!paceCand) paceCand = bestPair.d.sec >= bestPair.o.sec ? bestPair.o : bestPair.d;
        }
      }
      if (!pick) {
        // 글자 높이(폰트 크기)가 가장 큰 값 → 화면의 큰 숫자
        var sorted = durCands.slice().sort(function (a, b) { return (b.h - a.h) || (b.sec - a.sec); });
        pick = { d: sorted[0] };
      }
      duration = pick.d;
    }

    if (duration) p.durationSec = duration.sec;
    if (paceCand) p.avgPaceSec = paceCand.sec;

    /* 3) 서로 계산해서 빈칸 메우기 */
    if (!p.durationSec && p.distanceKm && p.avgPaceSec) p.durationSec = Math.round(p.distanceKm * p.avgPaceSec);
    if (!p.avgPaceSec && p.distanceKm && p.durationSec) p.avgPaceSec = Math.round(p.durationSec / p.distanceKm);
    if (!p.distanceKm && p.durationSec && p.avgPaceSec) {
      var dv = p.durationSec / p.avgPaceSec;
      if (dv > 0.2 && dv < 100) p.distanceKm = Math.round(dv * 100) / 100;
    }

    /* 4) 심박·케던스: 숫자 옆의 단위(bpm/spm)로 구분 */
    function pickUnitNumber(kind, min, max, forbid) {
      var best = null;
      chunks.forEach(function (c) {
        var m = c.text.match(/^(\d{2,3})\s*([a-z]{1,5})?$/i);
        if (!m) return;
        var v = parseInt(m[1], 10);
        if (v < min || v > max) return;
        if (forbid && (unitHit(c.text, forbid) || unitNearby(c, forbid))) return;
        var inline = m[2] ? unitHit(m[2], kind) : false;
        if (!inline && !unitNearby(c, kind)) return;
        var score = (inline ? 3 : 2) + Math.min(1, c.conf / 100) + c.h / 500;
        if (!best || score > best.score) best = { v: v, score: score };
      });
      return best ? best.v : null;
    }
    p.avgHr = pickUnitNumber("bpm", 55, 215, "spm");
    p.cadence = pickUnitNumber("spm", 110, 225, "bpm");

    var kcalBest = null;
    chunks.forEach(function (c) {
      var m = c.text.match(/^(\d{2,4})\s*([a-z]{1,5})?$/i);
      if (!m || !(m[2] && unitHit(m[2], "kcal"))) return;
      var v = parseInt(m[1], 10);
      if (v >= 30 && v <= 5000) kcalBest = v;
    });
    p.kcal = kcalBest;

    /* 5) 날짜: 2026. 11. 18. / 2026년 11월 18일 / 2026 11 18 */
    var allText = chunks.map(function (c) { return c.text; }).join(" ") + " " + String(data.text || "").replace(/\s+/g, " ");
    p.date = parseDateText(allText) || dateFromLines(chunks);
    if (!p.date) {
      var md = allText.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
      if (!md) md = allText.match(/(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*\./);
      if (md) {
        var mMo = parseInt(md[1], 10), mDy = parseInt(md[2], 10);
        if (mMo >= 1 && mMo <= 12 && mDy >= 1 && mDy <= 31) {
          var thisYear = new Date().getFullYear();
          var guess = thisYear + "-" + pad(mMo) + "-" + pad(mDy);
          if (daysBetween(todayISO(), guess) > 0) guess = (thisYear - 1) + "-" + pad(mMo) + "-" + pad(mDy);
          p.date = guess;
        }
      }
    }

    /* 6) 못 읽은 칸 정리 */
    if (!p.date) p.missing.push("날짜");
    if (!p.distanceKm) p.missing.push("거리");
    if (!p.durationSec) p.missing.push("시간");
    if (!p.avgHr) p.missing.push("심박");
    if (!p.cadence) p.missing.push("케이던스");

    return p;
  }

  function mergeOcrResults(a, b) {
    var out = a;
    ["date", "distanceKm", "durationSec", "avgPaceSec", "avgHr", "cadence", "kcal"].forEach(function (k) {
      if ((out[k] == null || out[k] === undefined) && b[k] != null) out[k] = b[k];
    });
    if (b.confidence > out.confidence) out.confidence = b.confidence;
    out.missing = [];
    if (!out.date) out.missing.push("날짜");
    if (!out.distanceKm) out.missing.push("거리");
    if (!out.durationSec) out.missing.push("시간");
    if (!out.avgHr) out.missing.push("심박");
    if (!out.cadence) out.missing.push("케이던스");
    if (!out.text && b.text) out.text = b.text;
    return out;
  }

  function ocrNeedsSecondPass(p) {
    return !p.distanceKm || !p.durationSec || !p.avgHr || !p.cadence;
  }

  function ocrResultCard(a) {
    var conf = a.confidence || 0;
    var confTxt = conf >= 80 ? "높음" : conf >= 55 ? "보통" : "낮음";
    var bits = [
      "날짜 <b>" + (a.date || "—") + "</b>",
      "거리 <b>" + (a.distanceKm ? fmtKm(a.distanceKm) + "km" : "—") + "</b>",
      "시간 <b>" + (a.durationSec ? fmtTime(a.durationSec) : "—") + "</b>",
      "페이스 <b>" + (a.distanceKm && a.durationSec ? fmtPace(a.durationSec / a.distanceKm) : "—") + "</b>"
    ];
    if (a.avgHr) bits.push("심박 <b>" + a.avgHr + "bpm</b>");
    if (a.cadence) bits.push("케이던스 <b>" + a.cadence + "spm</b>");
    if (a.kcal) bits.push('<span class="tiny">' + a.kcal + " kcal</span>");
    var html = '<div class="ai-box" style="margin-top:10px"><span class="lbl">무료 OCR 인식 완료 · 정확도 ' + confTxt + " (" + conf + "%)" + (a.inverted ? " · 다크 화면 보정" : "") + "</span>" + bits.join(" · ");
    if (a.coach) html += '<span style="display:block;margin-top:7px">"' + esc(a.coach) + '"</span>';
    if (a.missing && a.missing.length) {
      html += '<p class="tiny" style="margin-top:8px">못 읽은 칸: <b>' + a.missing.join(", ") + "</b> — 폼에서 직접 채워 주세요." +
        (a.missing.indexOf("날짜") >= 0 ? " 날짜 칸은 오늘로 두었어요." : "") + "</p>";
    }
    html += '<div class="btn-row" style="margin-top:10px"><button class="btn sm" data-act="retryOcr">📸 캡처 다시 읽기</button>' +
      '<button class="btn sm primary" data-act="saveRun">이 내용으로 바로 저장</button></div>';
    html += "</div>";
    return html;
  }

  /* --- 무료 OCR 실행 --- */
  async function runFreeOcr() {
    if (!draft.image) return toast("먼저 삼성헬스 캡처를 선택해 주세요.");
    var seq = ++ocrSeq;
    draft.busy = true;
    draft.error = "";
    draft.analysis = null;
    draft.status = "삼성헬스 화면에서 숫자 읽는 중…";
    render();
    var lastPaint = 0;
    ocrProgressCb = function (m) {
      if (seq !== ocrSeq) return;
      var label = ocrStatusLabel(m);
      if (label !== draft.status) draft.status = label;
      var now = Date.now();
      if (now - lastPaint > 150) { lastPaint = now; render(); }
    };
    try {
      var prep = await preprocessCapture(draft.image);
      if (seq !== ocrSeq) return;
      var worker = await getOcrWorker();
      if (seq !== ocrSeq) return;
      await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1", user_defined_dpi: "300" });
      var res = await worker.recognize(prep.gray, {}, { text: true, blocks: true });
      if (seq !== ocrSeq) return;
      var parsed = parseHealthCapture(res.data, prep.height);
      if (ocrNeedsSecondPass(parsed)) {
        draft.status = "흑백으로 한 번 더 확인하는 중…";
        render();
        await worker.setParameters({ tessedit_pageseg_mode: "11" });
        var res2 = await worker.recognize(prep.binary, {}, { text: true, blocks: true });
        if (seq !== ocrSeq) return;
        parsed = mergeOcrResults(parsed, parseHealthCapture(res2.data, prep.height));
      }
      if (prep.top) {
        // 상단(날짜·큰 거리) 영역은 숫자만 허용해 한 번 더 읽는다
        draft.status = "날짜와 거리를 한 번 더 확인하는 중…";
        render();
        await worker.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "0123456789.:()-/" });
        var res3 = await worker.recognize(prep.top, {}, { text: true });
        await worker.setParameters({ tessedit_char_whitelist: "" });
        if (seq !== ocrSeq) return;
        var wlText = String(res3.data.text || "");
        if (!parsed.date) {
          var dOnly = parseDateText(wlText);
          if (dOnly) {
            parsed.date = dOnly;
            parsed.missing = parsed.missing.filter(function (m) { return m !== "날짜"; });
          }
        }
        // 상단의 큰 거리 숫자를 숫자 전용으로 한 번 더 읽어 보정
        var wlDist = wlText.match(/(\d{1,3}[.,]\d{1,2})/);
        if (wlDist) {
          var wv = parseFloat(wlDist[1].replace(",", "."));
          if (wv > 0.2 && wv <= 200 && (!parsed.distanceKm || Math.abs(wv - parsed.distanceKm) <= 0.15)) {
            parsed.distanceKm = Math.round(wv * 100) / 100;
            parsed.missing = parsed.missing.filter(function (m) { return m !== "거리"; });
          }
        }
      }
      ocrProgressCb = null;
      finishOcr(parsed, prep);
    } catch (err) {
      if (seq !== ocrSeq) return;
      ocrProgressCb = null;
      draft.busy = false;
      draft.status = "";
      var msg = (err && err.message) || String(err);
      draft.error = msg + " — 폼에 숫자를 직접 넣어도 페이스는 자동 계산돼요.";
      render();
    }
  }

  /* 코치 문장이 비었을 때(진단 미해당) 쓸 기본 피드백 */
  function ocrCoachFallback(p) {
    if (!p.distanceKm || !p.durationSec) return "";
    var f = fitness();
    var pace = p.durationSec / p.distanceKm;
    var maxHR = state.settings.maxHr || 174;
    var out = ["평균 " + fmtPace(pace) + " · " + fmtKm(p.distanceKm) + "km를 기록했어요."];
    if (pace <= f.pace - 12) {
      out.push("추정 10K 페이스(" + fmtPace(f.pace) + ")보다 빠른 강도라 주 1회면 충분해요.");
    } else if (pace >= f.pace + 40) {
      out.push("이지 강도로 잘 조절했어요. 이 속도를 지켜야 다음 강도 훈련이 살아납니다.");
    } else {
      out.push("훈련 계획과 예상 기록을 다시 계산해 두었어요.");
    }
    if (p.avgHr && p.cadence && p.cadence < 165) {
      out.push("케이던스 " + p.cadence + "spm은 조금 낮아요. 168~172에 맞춰 보폭을 줄여 보세요.");
    } else if (p.avgHr && p.avgHr > Math.round(maxHR * 0.8) && pace >= f.pace + 20) {
      out.push("심박 " + p.avgHr + "bpm은 이 페이스치고 조금 높아요. 다음엔 20~30초/km 늦춰 보세요.");
    } else if (p.avgHr) {
      out.push("심박 " + p.avgHr + "bpm으로 페이스를 잘 통제했어요.");
    }
    return out.slice(0, 2).join(" ");
  }

  function finishOcr(p, prep) {
    draft.busy = false;
    draft.status = "";
    draft.error = "";
    if (p.date) draft.date = p.date;
    if (p.distanceKm) draft.km = String(Math.round(p.distanceKm * 100) / 100);
    if (p.durationSec) draft.time = fmtTime(p.durationSec);
    if (p.avgHr) draft.hr = String(Math.round(p.avgHr));
    if (p.cadence) draft.cadence = String(Math.round(p.cadence));

    var run = { date: draft.date, distanceKm: p.distanceKm, durationSec: p.durationSec, avgHr: p.avgHr, cadence: p.cadence, condition: draft.condition };
    var coach = "";
    try { if (run.distanceKm && run.durationSec) coach = coachNote(run); } catch (e) { coach = ""; }
    if (!coach) coach = ocrCoachFallback(p);

    draft.analysis = {
      ocr: true,
      date: p.date,
      distanceKm: p.distanceKm,
      durationSec: p.durationSec,
      avgPaceSec: p.avgPaceSec,
      avgHr: p.avgHr,
      cadence: p.cadence,
      kcal: p.kcal,
      confidence: p.confidence,
      coach: coach,
      missing: p.missing,
      inverted: prep ? prep.inverted : false,
      text: p.text
    };
    render();
    var got = [];
    if (p.distanceKm) got.push("거리");
    if (p.durationSec) got.push("시간");
    if (p.avgHr) got.push("심박");
    if (p.cadence) got.push("케이던스");
    if (p.date) got.push("날짜");
    if (got.length >= 2) {
      toast("캡처에서 <b>" + got.join("·") + "</b>를 읽었어요." + (p.missing.length ? " 못 읽은 칸은 손으로 채워 주세요." : ""));
    } else {
      toast("숫자를 거의 읽지 못했어요. 캡처를 다시 올리거나 폼에 직접 입력해 주세요.");
    }
  }

  /* 샘플 캡처 인식 체험 (API 키 불필요) */
  async function runDemoParse() {
    draft.image = "assets/samsung-health-sample.svg";
    draft.imageName = "samsung-health-2026-11-17.svg";
    draft.busy = true;
    draft.analysis = null;
    draft.error = "";
    var steps = ["캡처 업로드 완료", "숫자 영역 인식 중…", "페이스·심박 계산 중…"];
    for (var i = 0; i < steps.length; i++) {
      draft.status = steps[i];
      render();
      await sleep(420);
    }
    var a = {
      demo: true,
      date: "2026-11-17",
      distanceKm: 8.35,
      durationSec: 2992,
      avgPaceSec: 358,
      avgHr: 141,
      cadence: 167,
      confidence: "high",
      coach: "8.35km를 5'58\"/km로 완주했어요. 이지 구간에서는 심박 141이 조금 높으니 다음 러닝은 6'15\"까지 늦춰 130대에 머물러 보세요. 케이던스 167은 168~172로 3%만 올리면 무릎 부담이 줄어듭니다."
    };
    applyAnalysis(a);
    draft.condition = "knee";
    draft.memo = "탄천 8km. 6km 지나니 오른쪽 무릎 바깥이 뻐근";
    draft.busy = false;
    draft.status = "";
    render();
    toast("샘플 캡처에서 <b>8.35km · 49:52 · 5'58\"/km · 141bpm</b>를 읽었어요.");
  }

  /* ------------------------------------------------------------------ *
   *  기록 저장 / 수정 / 삭제
   * ------------------------------------------------------------------ */
  function saveRun() {
    var km = parseFloat(draft.km);
    var dur = parseTimeInput(draft.time);
    if (!draft.date) return toast("날짜를 선택해 주세요.");
    if (!(km > 0)) return toast("거리(km)를 입력해 주세요.");
    if (!(dur > 0)) return toast("시간을 분:초 형식으로 입력해 주세요. 예) 49:52");
    if (daysBetween(todayISO(), draft.date) > 0) return toast("미래 날짜는 기록할 수 없어요.");

    var race = activeRace();
    var fitBefore = fitness();
    var predBefore = predictRace(race, fitBefore);

    var run = {
      id: draft.editingId || uid("run"),
      date: draft.date,
      distanceKm: Math.round(km * 100) / 100,
      durationSec: dur,
      avgHr: draft.hr ? parseInt(draft.hr, 10) : null,
      cadence: draft.cadence ? parseInt(draft.cadence, 10) : null,
      condition: draft.condition || "good",
      memo: draft.memo || "",
      source: draft.analysis ? (draft.analysis.demo ? "sample" : draft.analysis.ocr ? "ocr" : "ai") : "manual",
      aiCoach: draft.analysis && draft.analysis.coach ? draft.analysis.coach : ""
    };

    if (draft.editingId) {
      var idx = state.runs.findIndex(function (r) { return r.id === draft.editingId; });
      if (idx >= 0) state.runs[idx] = run;
    } else {
      state.runs.push(run);
    }
    state.runs.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    save();

    var fitAfter = fitness();
    var predAfter = predictRace(race, fitAfter);
    var diff = predBefore != null && predAfter != null ? predAfter - predBefore : 0;
    var dirTxt = diff === 0 ? "변화 없음" : (diff < 0 ? "▲ " + fmtTime(-diff) + " 단축" : "▼ " + fmtTime(diff) + " 지연");

    draft = newDraft();
    state.tab = "home";
    save();
    planCache = null;
    var diag = diagnoseRun(run);
    render();

    var msg = "기록 저장 완료 · 예상 완주 <b>" + fmtTime(predBefore) + " → " + fmtTime(predAfter) + "</b> (" + dirTxt + ")" +
      "<br>훈련 계획의 페이스 구간도 다시 계산했어요.";
    if (diag.length) {
      msg += "<br><b>코치 진단</b> " + diag.map(function (d) { return esc(d.badge); }).join(" · ");
    }
    toast(msg);
  }

  function editRun(id) {
    var r = state.runs.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    draft = {
      editingId: r.id,
      date: r.date,
      km: String(r.distanceKm),
      time: fmtTime(r.durationSec),
      hr: r.avgHr ? String(r.avgHr) : "",
      cadence: r.cadence ? String(r.cadence) : "",
      memo: r.memo || "",
      condition: r.condition || "good",
      image: null,
      imageName: "",
      analysis: null,
      busy: false,
      status: "",
      error: ""
    };
    state.tab = "add";
    save();
    render();
    toast("기록을 불러왔어요. 값을 고친 뒤 저장하세요.");
  }

  function delRun(id) {
    var r = state.runs.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    if (!confirm(r.date + " " + fmtKm(r.distanceKm) + "km 기록을 삭제할까요?")) return;
    state.runs = state.runs.filter(function (x) { return x.id !== id; });
    save();
    render();
    toast("기록을 삭제하고 계획을 다시 계산했어요.");
  }

  /* ------------------------------------------------------------------ *
   *  대회 관리
   * ------------------------------------------------------------------ */
  var raceEditId = null;

  function saveRace() {
    var name = $("#r-name").value.trim();
    var date = $("#r-date").value;
    var dist = parseFloat($("#r-dist").value);
    var goal = parseTimeInput($("#r-goal").value) || Math.round(dist * 330);
    var start = $("#r-start").value;
    var place = $("#r-place").value.trim();
    if (!name) return toast("대회명을 입력해 주세요.");
    if (!date) return toast("대회 날짜를 선택해 주세요.");
    if (raceEditId) {
      var r = state.races.filter(function (x) { return x.id === raceEditId; })[0];
      if (r) { r.name = name; r.date = date; r.distance = dist; r.goalSec = goal; r.start = start; r.place = place; }
    } else {
      var nr = { id: uid("race"), name: name, date: date, distance: dist, goalSec: goal, start: start, place: place };
      state.races.push(nr);
      state.activeRaceId = nr.id;
    }
    state.races.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    save();
    raceEditId = null;
    render();
    toast("대회를 저장했어요. " + distLabel(dist) + " 계획을 새로 만들었습니다.");
  }

  function editRace(id) {
    var r = state.races.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    raceEditId = id;
    $("#r-name").value = r.name;
    $("#r-date").value = r.date;
    $("#r-dist").value = String(r.distance);
    $("#r-goal").value = fmtTime(r.goalSec);
    $("#r-start").value = r.start || "09:00";
    $("#r-place").value = r.place || "";
    $("#raceFormTitle").textContent = "대회 수정";
    $("#raceCancelBtn").style.display = "";
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  function resetRaceForm() {
    raceEditId = null;
    render();
  }

  function delRace(id) {
    var r = state.races.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    if (!confirm("'" + r.name + "' 대회와 훈련 계획을 삭제할까요? (기록은 남습니다)")) return;
    state.races = state.races.filter(function (x) { return x.id !== id; });
    if (state.activeRaceId === id) state.activeRaceId = state.races[0] ? state.races[0].id : null;
    save();
    render();
    toast("대회를 삭제했어요.");
  }

  /* ------------------------------------------------------------------ *
   *  설정 저장 · 데이터
   * ------------------------------------------------------------------ */
  function saveSettings() {
    var keyEl = $("#s-key");
    var modelEl = $("#s-model");
    var k = keyEl ? keyEl.value.trim() : "";
    if (k) state.settings.apiKey = k;
    if (modelEl) state.settings.model = modelEl.value.trim();
    if (!state.settings.apiKey) state.settings.provider = "none";
    save();
    render();
    if (state.settings.apiKey) {
      toast("저장했어요. 이제 캡처를 올리면 " + (state.settings.provider === "claude" ? "Claude" : "OpenAI") + "가 숫자를 읽습니다.");
    } else {
      toast("수기 입력 모드로 동작합니다. 키를 넣으면 캡처 자동 인식이 켜져요.");
    }
  }

  function exportData() {
    var out = JSON.parse(JSON.stringify(state));
    delete out.settings.apiKey; // 키는 내보내지 않음
    out.exportedAt = new Date().toISOString();
    var blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pace-coach-" + todayISO() + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast("JSON을 내보냈어요. (API 키는 포함되지 않습니다)");
  }

  function importData(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var s = JSON.parse(fr.result);
        if (!s || !Array.isArray(s.races) || !Array.isArray(s.runs)) throw new Error("형식이 올바르지 않습니다.");
        if (!confirm("현재 데이터를 불러온 파일로 바꿀까요? (대회 " + s.races.length + "개, 기록 " + s.runs.length + "건)")) return;
        var keepKey = state.settings.apiKey;
        state = {
          v: 1,
          tab: "home",
          activeRaceId: s.activeRaceId || (s.races[0] && s.races[0].id) || null,
          settings: Object.assign({ provider: "none", apiKey: "", model: "", maxHr: 174, athlete: "현수" }, s.settings || {}),
          races: s.races,
          runs: s.runs,
          done: s.done || {}
        };
        state.settings.apiKey = keepKey; // 저장된 키는 유지
        if (!state.settings.provider) state.settings.provider = "none";
        save();
        render();
        toast("불러왔어요 · 대회 " + state.races.length + "개, 기록 " + state.runs.length + "건");
      } catch (e) {
        toast("불러오기 실패: " + esc(e.message));
      }
    };
    fr.readAsText(file);
  }

  /* ------------------------------------------------------------------ *
   *  시작
   * ------------------------------------------------------------------ */
  if (!localStorage.getItem(LS_KEY)) save();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () { /* 오프라인 캐시는 선택 사항 */ });
    });
  }

  render();

  // 디버깅/검증용
  window.paceCoach = {
    get state() { return state; },
    fitness: fitness,
    plan: function () { return buildPlan(activeRace(), fitness()); },
    predict: function () { return predictRace(activeRace(), fitness()); },
    diagnose: diagnoseRun,
    coachNote: coachNote,
    render: render,
    reset: function () { localStorage.removeItem(LS_KEY); state = defaultState(); draft = newDraft(); save(); render(); }
  };
})();
