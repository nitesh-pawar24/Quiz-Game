import React, { useState, useEffect } from "react";
import "./App.css";
import questions from "./questions";

// Fisher-Yates shuffle (returns a new array)
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Decode HTML entities from API questions/answers (e.g. &quot;, &#039;, &amp;)
function decodeHtml(html) {
  if (!html) return "";
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
}

const API_CATEGORY_MAP = {
  gk: 9,          // General Knowledge
  geography: 22,  // Geography
  history: 23,    // History
};

function App() {
  const [category, setCategory] = useState(null);
  const [questionsList, setQuestionsList] = useState([]);
  const [loading, setLoading] = useState(false);

  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState([]); // track per-question answers

  const [timeLeft, setTimeLeft] = useState(10);

  const [history, setHistory] = useState(() => {
    const stored = JSON.parse(localStorage.getItem("quizHistory")) || [];
    const clean = stored.filter(
      (h) => h && h.score && h.score.trim() !== "" && h.category && h.category.trim() !== "" && h.date
    );
    localStorage.setItem("quizHistory", JSON.stringify(clean));
    return clean;
  });

  // ===== START / LOAD QUIZ =====
  const startQuiz = async (cat) => {
    setCategory(cat);
    setLoading(true);
    setSelected(null);
    setCurrent(0);
    setScore(0);
    setAnswers([]);
    setTimeLeft(10);

    let fetchedQuestions = null;

    // Check if category has an API endpoint mapping
    if (API_CATEGORY_MAP[cat]) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        const res = await fetch(
          `https://opentdb.com/api.php?amount=10&category=${API_CATEGORY_MAP[cat]}&type=multiple`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.response_code === 0 && data.results && data.results.length > 0) {
            fetchedQuestions = data.results.map((q) => ({
              question: decodeHtml(q.question),
              options: shuffle([...q.incorrect_answers, q.correct_answer].map(decodeHtml)),
              answer: decodeHtml(q.correct_answer),
            }));
          }
        }
      } catch (err) {
        console.warn("API fetch failed or timed out. Falling back to local questions:", err);
      }
    }

    // Fallback to local questions if API is offline/failed or category is local (Cricket/Football)
    if (!fetchedQuestions || fetchedQuestions.length === 0) {
      const local = questions[cat] || [];
      fetchedQuestions = shuffle(local).map((q) => ({
        ...q,
        options: shuffle(q.options),
      }));
    }

    setQuestionsList(fetchedQuestions);
    setLoading(false);
  };

  // ===== TIMER =====
  useEffect(() => {
    if (!category || loading || selected) return;
    if (current >= questionsList.length) return;

    if (timeLeft === 0) {
      const revealTimer = setTimeout(() => {
        if (!questionsList[current]) return;
        const correctAnswer = questionsList[current].answer;
        setSelected(correctAnswer);
        // Record as unanswered (timed out)
        setAnswers((prev) => [
          ...prev,
          {
            question: questionsList[current].question,
            userAnswer: null,
            correctAnswer,
            correct: false,
            timedOut: true,
          },
        ]);
      }, 1000);
      return () => clearTimeout(revealTimer);
    }

    const timer = setTimeout(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [timeLeft, selected, category, loading, current, questionsList]);

  // Reset timer on new question & save history when quiz ends
  useEffect(() => {
    if (!category || loading) return;

    if (current === questionsList.length && questionsList.length > 0) {
      const finalScore = {
        score: `${score} / ${questionsList.length}`,
        category: category.toUpperCase(),
        date: new Date().toLocaleString(),
      };

      const prevHistory = JSON.parse(localStorage.getItem("quizHistory")) || [];
      const updated = [finalScore, ...prevHistory].slice(0, 5);

      setHistory(updated);
      localStorage.setItem("quizHistory", JSON.stringify(updated));
    }
  }, [current, category, loading, questionsList.length, score]);

  // ===== OPTION CLICK =====
  const handleOptionClick = (option) => {
    if (selected || !questionsList[current]) return;

    const isCorrect = option === questionsList[current].answer;
    setSelected(option);
    if (isCorrect) setScore((prev) => prev + 1);

    setAnswers((prev) => [
      ...prev,
      {
        question: questionsList[current].question,
        userAnswer: option,
        correctAnswer: questionsList[current].answer,
        correct: isCorrect,
        timedOut: false,
      },
    ]);
  };

  // ===== NEXT QUESTION =====
  const nextQuestion = () => {
    setCurrent((prev) => prev + 1);
    setSelected(null);
    setTimeLeft(10);
  };

  // ===== AUTO-ADVANCE AFTER ANSWER =====
  useEffect(() => {
    if (!selected) return;
    const timer = setTimeout(() => {
      nextQuestion();
    }, 1500);
    return () => clearTimeout(timer);
  }, [selected]);

  // ===== HELPERS =====
  const getGrade = (s, total) => {
    const pct = total > 0 ? (s / total) * 100 : 0;
    if (pct === 100) return { label: "Perfect!", emoji: "🏆", color: "#f59e0b" };
    if (pct >= 80)  return { label: "Excellent!", emoji: "🌟", color: "#22c55e" };
    if (pct >= 60)  return { label: "Good Job!", emoji: "👍", color: "#3b82f6" };
    if (pct >= 40)  return { label: "Keep Going!", emoji: "💪", color: "#f97316" };
    return { label: "Try Again!", emoji: "😅", color: "#ef4444" };
  };

  const getMessage = (s, total) => {
    const pct = total > 0 ? (s / total) * 100 : 0;
    if (pct === 100) return "Flawless! You got every single question right. You're a true champion!";
    if (pct >= 80)  return "Amazing work! You clearly know your stuff. Just a little more to reach perfection!";
    if (pct >= 60)  return "Solid effort! You're on the right track — a bit more practice and you'll nail it!";
    if (pct >= 40)  return "Not bad! Keep studying and you'll see big improvement next round.";
    return "Don't give up! Every expert started as a beginner. Give it another shot!";
  };

  // ===== CATEGORY SCREEN =====
  if (!category) {
    return (
      <div className="app">
        <h1>Quiz Game 🎮</h1>
        <h2>Select Category</h2>

        <div className="categories">
          <button onClick={() => startQuiz("cricket")}>CRICKET</button>
          <button onClick={() => startQuiz("football")}>FOOTBALL</button>
          <button onClick={() => startQuiz("gk")}>GK</button>
          <button onClick={() => startQuiz("geography")}>GEOGRAPHY</button>
          <button onClick={() => startQuiz("history")}>HISTORY</button>
        </div>

        {/* SCORE HISTORY */}
        <div className="history">
          <h3>📊 Score History</h3>

          {history.length === 0 ? (
            <p style={{ color: "#1f5c2e", fontStyle: "italic" }}>No quiz played yet — play one to see your score here!</p>
          ) : (
            history.map((h, i) => (
              <div key={i} className="history-item">
                <strong>{h.category}</strong> — {h.score}
                <br />
                <small>{h.date}</small>
              </div>
            ))
          )}

          {history.length > 0 && (
            <button
              className="next-btn"
              onClick={() => {
                localStorage.removeItem("quizHistory");
                setHistory([]);
              }}
            >
              Clear History
            </button>
          )}
        </div>
      </div>
    );
  }

  // ===== LOADING SCREEN =====
  if (loading) {
    return (
      <div className="app loading-container">
        <div className="spinner"></div>
        <h2>Fetching Fresh Questions...</h2>
        <p className="loading-subtext">Connecting to trivia database</p>
      </div>
    );
  }

  // ===== FINAL SCORE SCREEN =====
  if (current >= questionsList.length) {
    const total = questionsList.length;
    const grade = getGrade(score, total);
    const message = getMessage(score, total);
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;

    const circumference = 2 * Math.PI * 54; // r=54
    const dashOffset = circumference - (pct / 100) * circumference;

    return (
      <div className="app results-screen">
        {/* ── Grade badge ── */}
        <div className="grade-badge" style={{ borderColor: grade.color, color: grade.color }}>
          <span className="grade-emoji">{grade.emoji}</span>
          <span className="grade-label">{grade.label}</span>
        </div>

        {/* ── Score ring ── */}
        <div className="score-ring-wrap">
          <svg className="score-ring" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="10" />
            <circle
              cx="60" cy="60" r="54"
              fill="none"
              stroke={grade.color}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 60 60)"
              style={{ transition: "stroke-dashoffset 1.2s ease" }}
            />
          </svg>
          <div className="score-ring-text">
            <span className="score-num">{score}</span>
            <span className="score-denom">/ {total}</span>
            <span className="score-pct">{pct}%</span>
          </div>
        </div>

        {/* ── Motivational message ── */}
        <p className="results-message">{message}</p>

        {/* ── Per-question breakdown ── */}
        <div className="breakdown">
          <h3 className="breakdown-title">📋 Question Breakdown</h3>
          {answers.map((ans, i) => (
            <div
              key={i}
              className={`breakdown-item ${ans.correct ? "breakdown-correct" : "breakdown-wrong"}`}
            >
              <div className="breakdown-header">
                <span className="breakdown-num">Q{i + 1}</span>
                <span className="breakdown-icon">{ans.correct ? "✅" : "❌"}</span>
              </div>
              <p className="breakdown-question">{ans.question}</p>
              <div className="breakdown-answers">
                {ans.timedOut ? (
                  <span className="breakdown-yours timed-out">⏰ Time's up — no answer given</span>
                ) : (
                  <span className="breakdown-yours">
                    Your answer: <strong>{ans.userAnswer}</strong>
                  </span>
                )}
                {!ans.correct && (
                  <span className="breakdown-correct-ans">
                    Correct: <strong>{ans.correctAnswer}</strong>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Action buttons ── */}
        <div className="results-actions">
          <button
            className="results-btn primary-btn"
            onClick={() => startQuiz(category)}
          >
            🔄 Play Again
          </button>
          <button
            className="results-btn secondary-btn"
            onClick={() => {
              setCategory(null);
              setQuestionsList([]);
              setCurrent(0);
              setScore(0);
              setSelected(null);
              setAnswers([]);
              setTimeLeft(10);
            }}
          >
            🏠 Back to Menu
          </button>
        </div>
      </div>
    );
  }

  // ===== PROGRESS BAR =====
  const progressPercent = (timeLeft / 10) * 100;

  let progressColor = "#22c55e";
  if (timeLeft <= 6) progressColor = "#facc15";
  if (timeLeft <= 3) progressColor = "#ef4444";

  return (
    <div className="app">
      <h1>Quiz Game 🎮</h1>

      {/* TIMER BAR */}
      <div className="timer-bar">
        <div
          className="timer-fill"
          style={{
            width: `${progressPercent}%`,
            background: progressColor,
          }}
        ></div>
      </div>

      <h2>{questionsList[current]?.question}</h2>

      {/* OPTIONS */}
      <div className="options">
        {questionsList[current]?.options.map((option, index) => (
          <button
            key={index}
            className={`option ${
              selected
                ? option === questionsList[current].answer
                  ? "correct"
                  : option === selected
                  ? "wrong"
                  : ""
                : ""
            }`}
            onClick={() => handleOptionClick(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <p>
        Question {current + 1} / {questionsList.length}
      </p>

      {/* SIMPLE BACK BUTTON */}
      <button
        className="next-btn back-btn"
        onClick={() => {
          setCategory(null);
          setQuestionsList([]);
          setCurrent(0);
          setScore(0);
          setSelected(null);
          setAnswers([]);
        }}
      >
        ⬅ Back to Menu
      </button>
    </div>
  );
}

export default App;
