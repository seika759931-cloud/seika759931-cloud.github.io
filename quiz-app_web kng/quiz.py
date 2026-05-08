import csv, random as r
from io import StringIO
import pandas as pd

questions = []
qlist = []  # 出題対象リストをグローバルに保持
selected_category = None
current_index = 0
score = 0
question_limit = None

category_map = {
    "t1": "必修", "t2": "人体", "t3": "疾病", "t4": "社会", "t5": "基礎",
    "t6": "成人", "t7": "老年", "t8": "小児", "t9": "母性", "t10": "精神", "t11": "在宅", "t12": "統合",
}

def load_csv(text):
    global questions
    df = pd.read_csv(StringIO(text), on_bad_lines="skip")
    df.fillna("", inplace=True)  # 欠損値を空文字に
    questions = df.to_dict(orient="records")

def set_category(key):
    global selected_category, current_index, score, qlist
    current_index = 0
    score = 0
    if key == "t13":
        selected_category = None  # 全カテゴリ
    else:
        selected_category = category_map.get(key)
    # 出題対象リストを作成
    qlist = [q for q in questions if q["category"] == selected_category] if selected_category else questions
    print("選択カテゴリ:", selected_category, "問題数:", len(qlist))  # ←ここで確認
    r.shuffle(qlist)
    if question_limit is not None:
        qlist = qlist[:question_limit]

def set_question_count(n):
    global question_limit
    question_limit = int(n)

def get_next_question():
    global current_index, qlist, score, question_limit
    if not qlist:
        return {"question": "問題がありません"}

    # 出題数制限を優先して判定
    if question_limit and current_index >= question_limit:
        return {
            "question": "終了！",
            "choice1": "",
            "choice2": "",
            "choice3": "",
            "choice4": "",
            "explanation": f"スコア: {score}/{question_limit}"
        }

    if current_index >= len(qlist):
        return {
            "question": "終了！",
            "choice1": "",
            "choice2": "",
            "choice3": "",
            "choice4": "",
            "explanation": f"スコア: {score}/{len(qlist)}"
        }

    q = qlist[current_index]
    q["index"] = current_index

    if not q.get("question"):
        q["question"] = "（問題文がありません）"
    if not q.get("explanation"):
        q["explanation"] = ""

    current_index += 1
    return q

def check_answer_text(index, selected_text):
    global score, qlist
    correct = qlist[index]["choice1"].strip()
    if selected_text.strip() == correct:
        score += 1
        return True
    return False

def get_total_questions():
    global question_limit, qlist
    if question_limit:
        return min(question_limit, len(qlist))
    return len(qlist)


def get_score():
    return score

def get_total_questions():
    return question_limit if question_limit else len(qlist)
