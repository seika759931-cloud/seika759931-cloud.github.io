let pyodide = null;

async function initPyodide() {
  pyodide = await loadPyodide();
  await pyodide.loadPackage("micropip");
  await pyodide.runPythonAsync(`
    import micropip
    await micropip.install("pandas")
  `);

  const csvText = await (await fetch("mondai.csv")).text();
  pyodide.globals.set("csv_text", csvText);

  await pyodide.runPythonAsync(await (await fetch("quiz.py")).text());
  await pyodide.runPythonAsync("load_csv(csv_text)");

  console.log("Pyodide準備完了！");
  document.getElementById("start-button").disabled = false;
}
window.onload = initPyodide;


function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}


function startQuiz() {
  showScreen("category-screen");
}

function saveHistory(question, choices, correct, userAnswer) {
    const history = JSON.parse(localStorage.getItem("history") || "[]");

    history.push({
        question: question,
        choices: choices,
        correct: correct,
        userAnswer: userAnswer,
        time: new Date().toLocaleString()
    });

    localStorage.setItem("history", JSON.stringify(history));
}

async function selectCategory(key) {
  await pyodide.runPythonAsync(`set_category("${key}")`);
  showScreen("count-screen");
}


async function startQuizWithCount() {
  localStorage.removeItem("history");
  let count = document.getElementById("num-questions").value;
  await pyodide.runPythonAsync(`set_question_count(${count})`);
  showScreen("question-screen");
  nextQuestion();
}


async function nextQuestion() {
  showScreen("question-screen"); 
  await new Promise(r => setTimeout(r, 0));  // ← DOM 更新待ち

  let q = await pyodide.runPythonAsync("get_next_question()");
  q = q.toJs();
  q = Object.fromEntries(q);   // ←ここ追加！

  console.log("取得した問題:", q);
  console.log("question:", q.question);
  console.log("choice1:", q.choice1);

  if (q.question && q.question.trim().startsWith("終了！")) {
    showResult();
    return;
  }
  console.log("終了判定用:", q);
  // ② 次に現在の問題番号を取得
  let current = q.index + 1;   // ← これだけでOK！
  let total = await pyodide.runPythonAsync("get_total_questions()");
  document.getElementById("question-count").textContent = `第 ${current}/${total}問`;
  
  document.getElementById("question-text").textContent = q.question;
  let choicesDiv = document.getElementById("choices");
  choicesDiv.innerHTML = "";
  
  // 選択肢を配列にまとめる
  let choices = [];
  for (let i = 1; i <= 4; i++) {
    if (q[`choice${i}`]) {
      choices.push(q[`choice${i}`]);
    }
  }

  // Fisher-Yates シャッフル
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }

  // シャッフル後にボタン生成
  choices.forEach(choice => {
    let btn = document.createElement("button");
    btn.textContent = choice;
    btn.onclick = async () => {
    let choiceText = JSON.stringify(btn.textContent);
    let result = await pyodide.runPythonAsync(`check_answer_text(${q.index}, ${choiceText})`);
    let explanationText = q.explanation ?? "";

    // ★★★ ここで履歴保存 ★★★
    saveHistory(
        q.question,
        choices,
        q.explanation,      // ← Python側で正解を返してるなら q.correct を使う
        btn.textContent
    );

    document.getElementById("explanation-text").textContent = result
        ? `正解！\n${explanationText}`
        : `不正解…\n${explanationText}`;
    showScreen("explanation-screen");
};
    choicesDiv.appendChild(btn);
  });
}

async function goNextFromExplanation() {
  nextQuestion();
  showScreen("question-screen");
}

async function showResult() {
  let score = await pyodide.runPythonAsync("get_score()");
  let total = await pyodide.runPythonAsync("get_total_questions()");

  let resultText = `終了！ あなたの得点は ${score} / ${total}`;
  document.getElementById("result-text").textContent = resultText;

  // 評価メッセージをスコアに応じて切り替え
  let evaluation = "";
  if (score == total) {
    evaluation = "満点合格おめでとう！！";
  } else if (score >= total * 0.8) {
    evaluation = "おしい！！あと少しで満点！！";
  } else if (score >= total * 0.6) {
    evaluation = "合格おめでとう！！";
  } else if (score >= total * 0.5) {
    evaluation = "惜しい！もう少しで合格！もう一回チャレンジしてね！";
  } else if (score <= total * 0.1) {
    evaluation = "本当に勉強してる!？";
  } else {
    evaluation = "勉強してからもう一度！";
  }

  document.getElementById("evaluation-text").textContent = evaluation;
  showScreen("result-screen");
}


window.onload = initPyodide;




