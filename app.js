const BANK = window.QUESTION_BANK;
const QUESTIONS = BANK.questions;
const STORAGE_KEY = "ds-final-exam-system-v1";

const TYPE_ORDER = ["全部", "选择题", "填空题", "判断题", "简答题", "算法设计题"];

const defaultState = {
  mode: "practice",
  filter: "全部",
  practiceIndex: 0,
  practiceAnswers: {},
  practiceResults: {},
  examSize: "全部",
  examIds: QUESTIONS.map((q) => q.id),
  examAnswers: {},
  examSubmitted: false,
  showOnlyWrong: true,
};

let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved) return structuredClone(defaultState);
    return { ...structuredClone(defaultState), ...saved };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function questionById(id) {
  return QUESTIONS.find((question) => question.id === id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/×/g, "x")
    .replace(/√/g, "true")
    .replace(/正确/g, "true")
    .replace(/错误/g, "false")
    .replace(/\s+/g, "")
    .replace(/[，。、“”‘’；：？！（）()\[\]{}<>《》,.!?;:'"\\/\-_=+*^`~|]/g, "");
}

function answerFor(question, scope = "practice") {
  const source = scope === "exam" ? state.examAnswers : state.practiceAnswers;
  return source[question.id] ?? "";
}

function hasAnswer(question, answer) {
  if (question.type === "choice" || question.type === "judge") return answer !== "";
  return String(answer ?? "").trim().length > 0;
}

function compareBlank(userAnswer, acceptedAnswers) {
  const normalizedUser = normalize(userAnswer);
  if (!normalizedUser) return false;
  return acceptedAnswers.some((answer) => {
    const normalizedAnswer = normalize(answer);
    return normalizedUser === normalizedAnswer;
  });
}

function rubricHit(userAnswer, group) {
  const normalizedUser = normalize(userAnswer);
  const alternatives = group.any || [];
  return alternatives.some((item) => {
    const normalizedItem = normalize(item);
    return normalizedItem && normalizedUser.includes(normalizedItem);
  });
}

function gradeQuestion(question, userAnswer) {
  if (!hasAnswer(question, userAnswer)) {
    return {
      score: 0,
      correct: false,
      status: "wrong",
      message: "未作答",
      matched: [],
    };
  }

  if (question.type === "choice") {
    const correct = userAnswer === question.answer;
    return {
      score: correct ? 1 : 0,
      correct,
      status: correct ? "correct" : "wrong",
      message: correct ? "正确" : "错误",
      matched: [],
    };
  }

  if (question.type === "judge") {
    const value = userAnswer === "true";
    const correct = value === question.answer;
    return {
      score: correct ? 1 : 0,
      correct,
      status: correct ? "correct" : "wrong",
      message: correct ? "正确" : "错误",
      matched: [],
    };
  }

  if (question.type === "blank") {
    const correct = compareBlank(userAnswer, question.acceptedAnswers);
    return {
      score: correct ? 1 : 0,
      correct,
      status: correct ? "correct" : "wrong",
      message: correct ? "正确" : "错误",
      matched: [],
    };
  }

  const matched = (question.rubric || []).map((group) => ({
    label: group.label,
    hit: rubricHit(userAnswer, group),
  }));
  const hits = matched.filter((item) => item.hit).length;
  const total = matched.length || 1;
  const score = hits / total;
  return {
    score,
    correct: score >= 0.8,
    status: score >= 0.8 ? "correct" : score > 0 ? "partial" : "wrong",
    message:
      score >= 0.8
        ? "关键词匹配充分"
        : score > 0
          ? `部分得分：${hits}/${total}`
          : "未命中关键词",
    matched,
  };
}

function filteredQuestions() {
  if (state.filter === "全部") return QUESTIONS;
  return QUESTIONS.filter((question) => question.typeName === state.filter);
}

function typeCounts() {
  return TYPE_ORDER.map((typeName) => ({
    typeName,
    count: typeName === "全部" ? QUESTIONS.length : QUESTIONS.filter((q) => q.typeName === typeName).length,
  }));
}

function examQuestions() {
  return state.examIds.map(questionById).filter(Boolean);
}

function answeredExamCount() {
  return examQuestions().filter((question) => hasAnswer(question, answerFor(question, "exam"))).length;
}

function gradeExam() {
  const items = examQuestions().map((question, index) => {
    const userAnswer = answerFor(question, "exam");
    const grade = gradeQuestion(question, userAnswer);
    return { question, index, userAnswer, grade };
  });
  const score = items.reduce((sum, item) => sum + item.grade.score, 0);
  return {
    items,
    score,
    total: items.length,
    percent: items.length ? Math.round((score / items.length) * 1000) / 10 : 0,
    fullCorrect: items.filter((item) => item.grade.score === 1).length,
    partial: items.filter((item) => item.grade.score > 0 && item.grade.score < 1).length,
  };
}

function statsMarkup() {
  const counts = typeCounts().filter((item) => item.typeName !== "全部");
  return `
    <section class="stats-strip" aria-label="题库统计">
      <div class="stat"><span>总题量</span><strong>${QUESTIONS.length}</strong></div>
      ${counts
        .map((item) => `<div class="stat"><span>${item.typeName}</span><strong>${item.count}</strong></div>`)
        .join("")}
    </section>
  `;
}

function headerMarkup() {
  return `
    <header class="topbar">
      <div class="topbar-inner">
        <div>
          <div class="eyebrow">数据结构与算法</div>
          <h1>期末练习考试系统</h1>
          <p class="subtitle">题目来自两份综合练习 PDF，答案按教材第 3 版课后习题答案校对匹配。</p>
        </div>
        <nav class="mode-tabs" aria-label="模式切换">
          <button class="tab-button ${state.mode === "practice" ? "active" : ""}" data-mode="practice">练习模式</button>
          <button class="tab-button ${state.mode === "exam" ? "active" : ""}" data-mode="exam">考试模式</button>
        </nav>
      </div>
    </header>
  `;
}

function filterPanelMarkup(list, activeQuestion) {
  return `
    <aside class="side-panel">
      <div class="side-title">
        <span>题型导航</span>
        <span class="small-muted">${list.length} 题</span>
      </div>
      <div class="filter-list">
        ${typeCounts()
          .map(
            (item) => `
              <button class="pill-button ${state.filter === item.typeName ? "active" : ""}" data-filter="${item.typeName}">
                ${item.typeName} <span class="small-muted">(${item.count})</span>
              </button>
            `,
          )
          .join("")}
      </div>
      <div class="navigator" aria-label="题号导航">
        ${list
          .map((question, index) => {
            const result = state.practiceResults[question.id];
            const statusClass = result?.status === "correct" ? "correct" : result ? "wrong" : "";
            return `<button class="nav-dot ${activeQuestion?.id === question.id ? "active" : ""} ${statusClass}" data-practice-index="${index}">${index + 1}</button>`;
          })
          .join("")}
      </div>
      <div class="actions">
        <button class="ghost-button" data-action="reset-practice-all">清空练习记录</button>
      </div>
    </aside>
  `;
}

function questionMetaMarkup(question, index, total) {
  return `
    <div class="question-head">
      <div class="question-meta">
        <span class="tag strong">${question.typeName}</span>
        <span class="tag">原卷第 ${question.number} 题</span>
        <span class="tag">${index + 1} / ${total}</span>
      </div>
      <span class="small-muted">${escapeHtml(question.source)}</span>
    </div>
  `;
}

function answerControlMarkup(question, value, scope) {
  const scopeAttr = scope === "exam" ? "data-exam-answer" : "data-practice-answer";
  if (question.type === "choice") {
    return `
      <div class="options">
        ${question.options
          .map(
            (option) => `
              <label class="option ${value === option.label ? "selected" : ""}">
                <input type="radio" name="${scope}-${question.id}" ${scopeAttr}="${question.id}" value="${option.label}" ${value === option.label ? "checked" : ""}>
                <span class="option-letter">${option.label}</span>
                <span>${escapeHtml(option.text)}</span>
              </label>
            `,
          )
          .join("")}
      </div>
    `;
  }

  if (question.type === "judge") {
    return `
      <div class="judge-grid options">
        ${[
          ["true", "正确"],
          ["false", "错误"],
        ]
          .map(
            ([boolValue, label]) => `
              <label class="option ${value === boolValue ? "selected" : ""}">
                <input type="radio" name="${scope}-${question.id}" ${scopeAttr}="${question.id}" value="${boolValue}" ${value === boolValue ? "checked" : ""}>
                <span class="option-letter">${label.slice(0, 1)}</span>
                <span>${label}</span>
              </label>
            `,
          )
          .join("")}
      </div>
    `;
  }

  if (question.type === "blank") {
    return `<input class="text-answer" ${scopeAttr}="${question.id}" value="${escapeHtml(value)}" placeholder="输入你的答案" />`;
  }

  return `<textarea class="short-answer" ${scopeAttr}="${question.id}" placeholder="写下你的解题过程或关键步骤">${escapeHtml(value)}</textarea>`;
}

function feedbackMarkup(question, result, userAnswer) {
  if (!result) return "";
  const answerLine = question.type === "judge" && userAnswer
    ? userAnswer === "true"
      ? "正确"
      : "错误"
    : userAnswer || "未作答";
  return `
    <div class="feedback ${result.status}">
      <div class="feedback-title">${escapeHtml(result.message)}</div>
      <div class="reference"><strong>你的答案：</strong>${escapeHtml(answerLine)}</div>
      <div class="reference"><strong>参考答案：</strong>${escapeHtml(question.referenceAnswer)}</div>
      ${rubricMarkup(result)}
      <div class="small-muted" style="margin-top: 8px;">${escapeHtml(question.answerSource || "")}</div>
    </div>
  `;
}

function rubricMarkup(result) {
  if (!result?.matched?.length) return "";
  return `
    <div class="rubric">
      ${result.matched
        .map((item) => `<span class="${item.hit ? "hit" : ""}">${item.hit ? "命中" : "缺少"}：${escapeHtml(item.label)}</span>`)
        .join("")}
    </div>
  `;
}

function practiceMarkup() {
  const list = filteredQuestions();
  if (state.practiceIndex >= list.length) state.practiceIndex = 0;
  const question = list[state.practiceIndex];
  if (!question) return `<div class="empty">当前筛选没有题目。</div>`;
  const value = answerFor(question, "practice");
  const result = state.practiceResults[question.id];
  return `
    <div class="workspace">
      ${filterPanelMarkup(list, question)}
      <main class="question-card">
        ${questionMetaMarkup(question, state.practiceIndex, list.length)}
        <p class="question-stem">${escapeHtml(question.stem)}</p>
        ${answerControlMarkup(question, value, "practice")}
        <div class="actions">
          <button class="primary-button" data-action="check-practice">提交本题</button>
          <button class="secondary-button" data-action="show-answer">查看答案</button>
          <button class="ghost-button" data-action="prev-practice">上一题</button>
          <button class="ghost-button" data-action="next-practice">下一题</button>
          <button class="ghost-button" data-action="reset-practice-one">重做本题</button>
        </div>
        ${feedbackMarkup(question, result, value)}
      </main>
    </div>
  `;
}

function examToolbarMarkup(result) {
  const answered = answeredExamCount();
  const total = examQuestions().length;
  const percent = total ? Math.round((answered / total) * 100) : 0;
  return `
    <aside class="exam-toolbar">
      <h2>考试设置</h2>
      <p class="small-muted">提交前不显示答案；交卷后统一评分，并列出错题和关键词评分细则。</p>
      <div class="exam-size">
        ${["30题", "50题", "全部"]
          .map(
            (size) => `<button class="pill-button ${state.examSize === size ? "active" : ""}" data-exam-size="${size}">${size}</button>`,
          )
          .join("")}
      </div>
      <div class="small-muted">答题进度：${answered} / ${total}</div>
      <div class="progress-bar" style="--value:${percent}%"><span></span></div>
      <div class="actions">
        <button class="primary-button" data-action="submit-exam">交卷评分</button>
        <button class="secondary-button" data-action="reset-exam">重置试卷</button>
      </div>
      ${
        state.examSubmitted && result
          ? `
            <hr style="border:0;border-top:1px solid var(--line);margin:16px 0;">
            <div class="score-number">${result.percent}</div>
            <div class="small-muted">总分 / 100</div>
            <p class="small-muted">全对 ${result.fullCorrect} 题，部分得分 ${result.partial} 题。</p>
            <button class="pill-button ${state.showOnlyWrong ? "active" : ""}" data-action="toggle-wrong">
              ${state.showOnlyWrong ? "正在查看错题/部分得分" : "正在查看全部评分"}
            </button>
          `
          : ""
      }
    </aside>
  `;
}

function examQuestionMarkup(question, index, total) {
  const value = answerFor(question, "exam");
  return `
    <article class="exam-question">
      <div class="exam-question-number">第 ${index + 1} 题 / ${total} · ${question.typeName} · 原卷第 ${question.number} 题</div>
      <p class="question-stem">${escapeHtml(question.stem)}</p>
      ${answerControlMarkup(question, value, "exam")}
    </article>
  `;
}

function resultPanelMarkup(result) {
  if (!state.examSubmitted || !result) return "";
  const items = state.showOnlyWrong
    ? result.items.filter((item) => item.grade.score < 1)
    : result.items;
  return `
    <section class="result-panel">
      <h2>评分细则</h2>
      <p class="small-muted">客观题按标准答案判分；简答和算法题按关键词部分得分。下面列出${state.showOnlyWrong ? "错题与部分得分题" : "全部题目"}。</p>
      <div class="detail-list">
        ${
          items.length
            ? items.map(detailItemMarkup).join("")
            : `<div class="empty">这部分没有错题，手感不错。</div>`
        }
      </div>
    </section>
  `;
}

function displayAnswer(question, value) {
  if (question.type === "judge" && value) return value === "true" ? "正确" : "错误";
  return value || "未作答";
}

function detailItemMarkup(item) {
  const { question, index, userAnswer, grade } = item;
  return `
    <div class="detail-item ${grade.status}">
      <div class="detail-title">第 ${index + 1} 题 · ${question.typeName} · ${grade.message}</div>
      <div class="detail-meta">得分：${Math.round(grade.score * 100)}% · 来源：${escapeHtml(question.source)}</div>
      <div class="reference"><strong>题目：</strong>${escapeHtml(question.stem)}</div>
      <div class="reference"><strong>你的答案：</strong>${escapeHtml(displayAnswer(question, userAnswer))}</div>
      <div class="reference"><strong>参考答案：</strong>${escapeHtml(question.referenceAnswer)}</div>
      ${rubricMarkup(grade)}
    </div>
  `;
}

function examMarkup() {
  const result = state.examSubmitted ? gradeExam() : null;
  const list = examQuestions();
  return `
    <div class="exam-layout">
      <main>
        ${resultPanelMarkup(result)}
        <div class="exam-list">
          ${list.map((question, index) => examQuestionMarkup(question, index, list.length)).join("")}
        </div>
      </main>
      ${examToolbarMarkup(result)}
    </div>
  `;
}

function appMarkup() {
  return `
    <div class="app-shell">
      ${headerMarkup()}
      <div class="page">
        ${statsMarkup()}
        ${state.mode === "practice" ? practiceMarkup() : examMarkup()}
      </div>
    </div>
  `;
}

function render() {
  document.getElementById("app").innerHTML = appMarkup();
  bindEvents();
  saveState();
}

function bindEvents() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      render();
    });
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      state.practiceIndex = 0;
      render();
    });
  });

  document.querySelectorAll("[data-practice-index]").forEach((button) => {
    button.addEventListener("click", () => {
      state.practiceIndex = Number(button.dataset.practiceIndex);
      render();
    });
  });

  document.querySelectorAll("[data-practice-answer]").forEach((input) => {
    const update = () => {
      state.practiceAnswers[input.dataset.practiceAnswer] = input.value;
      if (input.type === "radio") render();
      else saveState();
    };
    input.addEventListener(input.type === "radio" ? "change" : "input", update);
  });

  document.querySelectorAll("[data-exam-answer]").forEach((input) => {
    const update = () => {
      state.examAnswers[input.dataset.examAnswer] = input.value;
      state.examSubmitted = false;
      if (input.type === "radio") render();
      else saveState();
    };
    input.addEventListener(input.type === "radio" ? "change" : "input", update);
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });

  document.querySelectorAll("[data-exam-size]").forEach((button) => {
    button.addEventListener("click", () => {
      state.examSize = button.dataset.examSize;
      resetExamIds();
      render();
    });
  });
}

function currentPracticeQuestion() {
  const list = filteredQuestions();
  return list[state.practiceIndex] || list[0];
}

function handleAction(action) {
  const question = currentPracticeQuestion();
  if (action === "check-practice" && question) {
    const answer = answerFor(question, "practice");
    state.practiceResults[question.id] = gradeQuestion(question, answer);
    render();
    return;
  }

  if (action === "show-answer" && question) {
    state.practiceResults[question.id] = {
      ...gradeQuestion(question, answerFor(question, "practice")),
      message: "已显示参考答案",
      status: "partial",
    };
    render();
    return;
  }

  if (action === "next-practice") {
    const list = filteredQuestions();
    state.practiceIndex = Math.min(state.practiceIndex + 1, list.length - 1);
    render();
    return;
  }

  if (action === "prev-practice") {
    state.practiceIndex = Math.max(state.practiceIndex - 1, 0);
    render();
    return;
  }

  if (action === "reset-practice-one" && question) {
    delete state.practiceAnswers[question.id];
    delete state.practiceResults[question.id];
    render();
    return;
  }

  if (action === "reset-practice-all") {
    state.practiceAnswers = {};
    state.practiceResults = {};
    state.practiceIndex = 0;
    render();
    return;
  }

  if (action === "submit-exam") {
    state.examSubmitted = true;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (action === "reset-exam") {
    state.examAnswers = {};
    state.examSubmitted = false;
    resetExamIds();
    render();
    return;
  }

  if (action === "toggle-wrong") {
    state.showOnlyWrong = !state.showOnlyWrong;
    render();
  }
}

function resetExamIds() {
  const size = state.examSize === "30题" ? 30 : state.examSize === "50题" ? 50 : QUESTIONS.length;
  if (size === QUESTIONS.length) {
    state.examIds = QUESTIONS.map((question) => question.id);
    return;
  }
  state.examIds = shuffled(QUESTIONS)
    .slice(0, size)
    .map((question) => question.id);
}

function shuffled(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

render();
