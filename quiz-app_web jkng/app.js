let pyodide = null;

/**
 * 1. Pyodideの初期化とライブラリ・データの読み込み
 */
async function initPyodide() {
    console.log("Pyodideを初期化中...");
    pyodide = await loadPyodide();
    await pyodide.loadPackage("micropip");
    
    // pandasのインストール（初回のみ時間がかかります）
    await pyodide.runPythonAsync(`
        import micropip
        await micropip.install("pandas")
    `);

    // CSVファイルの読み込み
    try {
        const csvResponse = await fetch("mondai.csv");
        const csvText = await csvResponse.text();
        pyodide.globals.set("csv_text", csvText);

        // Pythonロジックファイル (quiz.py) の読み込み
        const pyResponse = await fetch("quiz.py");
        const pyCode = await pyResponse.text();
        await pyodide.runPythonAsync(pyCode);

        // CSVデータをPython側にセット
        await pyodide.runPythonAsync("load_csv(csv_text)");

        console.log("Pyodide準備完了！");
        // 準備ができたらスタートボタンを有効化
        const startBtn = document.getElementById("start-button");
        if (startBtn) startBtn.disabled = false;
        
    } catch (error) {
        console.error("初期化エラー:", error);
        alert("データの読み込みに失敗しました。ファイル名やパスを確認してください。");
    }
}

/**
 * 2. 画面切り替え制御
 */
function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const target = document.getElementById(id);
    if (target) target.classList.add("active");
}

/**
 * 3. クイズの流れ制御
 */
function startQuiz() {
    showScreen("category-screen");
}

async function selectCategory(key) {
    await pyodide.runPythonAsync(`set_category("${key}")`);
    showScreen("count-screen");
}

async function startQuizWithCount() {
    localStorage.removeItem("history"); // 履歴のリセット
    let count = document.getElementById("num-questions").value;
    await pyodide.runPythonAsync(`set_question_count(${count})`);
    nextQuestion(); // 最初の問題へ
}

/**
 * 4. 問題表示と正誤判定の核となる関数
 */
async function nextQuestion() {
    // 解説画像の初期化（前の問題の残像を消す）
    const imgElement = document.getElementById("explanation-image");
    if (imgElement) {
        imgElement.src = "";
        imgElement.style.display = "none";
    }
    
    // 画面を問題画面に切り替える
    showScreen("question-screen"); 
    await new Promise(r => setTimeout(r, 0)); // DOM更新を確実にするための待ち

    try {
        // Pythonから次の問題データを取得
        let q_raw = await pyodide.runPythonAsync("get_next_question()");
        let q = Object.fromEntries(q_raw.toJs()); // JSの連想配列に変換

        console.log("取得した問題データ:", q);

        // 終了判定
        if (q.question && q.question.trim().startsWith("終了！")) {
            showResult();
            return;
        }

        // 問題番号とテキストの表示
        let current = q.index + 1;
        let total = await pyodide.runPythonAsync("get_total_questions()");
        document.getElementById("question-count").textContent = `第 ${current}/${total}問`;
        document.getElementById("question-text").textContent = q.question;

        // 選択肢の抽出とシャッフル
        let choicesDiv = document.getElementById("choices");
        choicesDiv.innerHTML = "";
        
        let choices = [];
        for (let i = 1; i <= 4; i++) {
            if (q[`choice${i}`]) choices.push(q[`choice${i}`]);
        }

        // Fisher-Yates シャッフル
        for (let i = choices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [choices[i], choices[j]] = [choices[j], choices[i]];
        }

        // 選択肢ボタンの生成
        choices.forEach(choice => {
            let btn = document.createElement("button");
            btn.className = "choice-button";
            btn.textContent = choice;
            
            btn.onclick = async () => {
                // 正解チェック
                let choiceText = JSON.stringify(btn.textContent);
                let result = await pyodide.runPythonAsync(`check_answer_text(${q.index}, ${choiceText})`);
                
                // --- 解説画面の画像反映 ---
                if (q.img && q.img.trim() !== "") {
                    // キャッシュ回避のためタイムスタンプを付与（任意）
                    imgElement.src = q.img + "?t=" + Date.now();
                    imgElement.style.display = "block";
                } else {
                    imgElement.style.display = "none";
                }

                // --- 解説テキストの反映 ---
                let explanationBody = q.explanation ?? "";

                // 【追加】解説の1行目から「正解：」の後の文字だけを抜き出す
                let correctAnswer = "";
                if (explanationBody.includes("正解：")) {
                    correctAnswer = explanationBody.split('\n')[0].replace("正解：", "").trim();
                } else {
                    correctAnswer = "解説参照"; // 万が一「正解：」が含まれない場合の保険
                }

                document.getElementById("explanation-text").textContent = result
                    ? `【正解！】\n\n${explanationBody}`
                    : `【不正解…】\n\n${explanationBody}`;

                // 履歴保存
                // 引数の順番：(問題, 選択肢, 解説全文, ユーザーの答え, 抽出した正解)
                saveHistory(q.question, choices, explanationBody, btn.textContent, correctAnswer);

                showScreen("explanation-screen");
            };
            choicesDiv.appendChild(btn);
        });

    } catch (error) {
        console.error("実行エラー:", error);
    }
}

/**
 * 5. 履歴保存と結果表示
 */
function saveHistory(question, choices, explanation, userAnswer) {
    const history = JSON.parse(localStorage.getItem("history") || "[]");
    history.push({
        question: question,
        choices: choices,
        explanation: explanation,
        userAnswer: userAnswer,
        time: new Date().toLocaleString()
    });
    localStorage.setItem("history", JSON.stringify(history));
}

async function showResult() {
    let score = await pyodide.runPythonAsync("get_score()");
    let total = await pyodide.runPythonAsync("get_total_questions()");

    document.getElementById("result-text").textContent = `終了！ あなたの得点は ${score} / ${total}`;

    // スコアに応じた評価
    let evaluation = "";
    const ratio = score / total;
    if (ratio === 1) evaluation = "満点合格おめでとう！！";
    else if (ratio >= 0.8) evaluation = "おしい！！あと少しで満点！！";
    else if (ratio >= 0.6) evaluation = "合格おめでとう！！";
    else if (ratio >= 0.5) evaluation = "惜しい！もう少しで合格！";
    else if (ratio <= 0.1) evaluation = "本当に勉強してる!？";
    else evaluation = "勉強してからもう一度！";

    document.getElementById("evaluation-text").textContent = evaluation;
    showScreen("result-screen");
}

// ページ読み込み時にPyodideを起動
window.onload = initPyodide;

/**
 * 6. 解説画面から次の問題へ進むための制御
 */
function goNextFromExplanation() {
    // 次の問題を表示するメインロジックを呼び出す
    nextQuestion();
}
