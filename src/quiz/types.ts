/** Phase 3: quizzes, questions, attempts. Stored in the `quizzes` and `attempts` tables. */
import type { BloomLevel } from '../lesson/types';

export type QuestionType = 'mcq' | 'truefalse' | 'short' | 'matching' | 'ordering' | 'fill';

/** How a typed answer (short answer, fill-in blank) is compared with the accepted answers. */
export interface TextMatch {
  /** Ignore diacritics, tatweel, hamza forms, ta marbuta/ha, alef maqsura/ya, Arabic digits, letter case. */
  normalize: boolean;
  /** Ignore punctuation and extra spaces. */
  ignorePunctuation: boolean;
  /** Spelling mistakes tolerated as fully correct (0 = exact only). */
  typos: 0 | 1 | 2;
  /** Send every non-matching, non-empty answer to the teacher instead of marking it wrong. */
  reviewAllMismatches: boolean;
}

interface QuestionBase {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  objectiveIds: string[];
  /** Bloom level the question measures. 0 = taken from the linked objectives. */
  bloom: BloomLevel | 0;
  /** Shown to the student when the answer is fully correct. */
  feedbackCorrect: string;
  /** Shown when the answer is wrong or partly right — the explanation. */
  feedbackIncorrect: string;
}

export interface McqOption {
  id: string;
  text: string;
  /** Optional explanation shown when the student chose this option. */
  feedback: string;
}

export interface McqQuestion extends QuestionBase {
  type: 'mcq';
  options: McqOption[];
  correct: string[];
  /** true = student may choose several options (checkboxes). */
  multiple: boolean;
  /** Multiple-answer only: credit for each right choice minus each wrong one. */
  partial: boolean;
}

export interface TrueFalseQuestion extends QuestionBase {
  type: 'truefalse';
  answer: boolean | null;
}

export interface ShortQuestion extends QuestionBase {
  type: 'short';
  accepted: string[];
  match: TextMatch;
}

export interface MatchPair {
  id: string;
  left: string;
  right: string;
}

export interface MatchingQuestion extends QuestionBase {
  type: 'matching';
  pairs: MatchPair[];
  /** Extra wrong choices on the right side. */
  distractors: string[];
  partial: boolean;
}

export interface OrderItem {
  id: string;
  text: string;
}

export interface OrderingQuestion extends QuestionBase {
  type: 'ordering';
  /** Stored in the correct order. */
  items: OrderItem[];
  partial: boolean;
}

export interface FillQuestion extends QuestionBase {
  type: 'fill';
  /** Text with blanks written as [[answer|other accepted answer]]. */
  text: string;
  match: TextMatch;
  partial: boolean;
}

export type Question = McqQuestion | TrueFalseQuestion | ShortQuestion | MatchingQuestion | OrderingQuestion | FillQuestion;

export type FeedbackTiming = 'end' | 'immediate';
export type ScorePolicy = 'best' | 'last' | 'first';

export interface QuizSettings {
  /** Minimum percentage to pass (0–100). */
  passPercent: number;
  shuffleQuestions: boolean;
  /** Shuffle the options of multiple-choice questions. */
  shuffleOptions: boolean;
  /** After submitting: show the score and pass/fail. */
  showScore: boolean;
  /** After submitting: show which answers were right and the correct answers. */
  showCorrectAnswers: boolean;
  /** After submitting: show the feedback written for each question. */
  showFeedback: boolean;
  /** When the student sees whether an answer is right: after each question (answer is then locked) or after submitting. */
  feedbackTiming: FeedbackTiming;
  /** Which attempt counts for a student when there are several. Every attempt stays saved. */
  scorePolicy: ScorePolicy;
  /** 0 = unlimited. Counted per student name on this device. */
  maxAttempts: number;
  /** Minutes; 0 = no time limit. */
  timeLimit: number;
}

export interface Quiz {
  id: string;
  projectId: string;
  /** Optional: the lesson this quiz assesses. */
  lessonId: string | null;
  title: string;
  description: string;
  settings: QuizSettings;
  questions: Question[];
  /** Bumps on every save; guards against two windows overwriting each other. */
  rev: number;
  createdAt: number;
  updatedAt: number;
}

/* ───────── answers & attempts ───────── */

export type Answer =
  | { type: 'mcq'; selected: string[] }
  | { type: 'truefalse'; value: boolean | null }
  | { type: 'short'; text: string }
  | { type: 'matching'; map: Record<string, string> }
  | { type: 'ordering'; order: string[]; touched: boolean }
  | { type: 'fill'; blanks: string[] };

/** How sure the automatic grading is. */
export type Confidence = 'certain' | 'review';

export interface QuestionResult {
  questionId: string;
  earned: number;
  max: number;
  /** earned / max, 0–1 */
  fraction: number;
  status: 'correct' | 'partial' | 'incorrect' | 'unanswered' | 'review';
  confidence: Confidence;
  /** Human-readable reasons, e.g. "تطابق مع خطأ إملائي واحد". */
  notes: string[];
  /** Fill-in: per-blank result. */
  blanks?: { correct: boolean; review: boolean }[];
  /** Set when a teacher overrode the automatic grade. */
  override?: { earned: number; at: number };
}

export interface AttemptResult {
  earned: number;
  max: number;
  percent: number;
  passed: boolean;
  /** Answers still waiting for the teacher: score is provisional. */
  pendingReview: number;
  questions: QuestionResult[];
}

export interface Attempt {
  id: string;
  quizId: string;
  /** Normalised student name, used to count attempts. */
  studentKey: string;
  studentName: string;
  /** Teacher test runs are kept apart from real results. */
  preview: boolean;
  status: 'in_progress' | 'submitted';
  /** Copy of the quiz as it was when the attempt started, so later edits never rewrite history. */
  quiz: Pick<Quiz, 'id' | 'title' | 'settings' | 'questions' | 'rev' | 'lessonId' | 'projectId'>;
  /** Question order shown to this student. */
  order: string[];
  /** Option order per multiple-choice question, and right-side order per matching question. */
  optionOrder: Record<string, string[]>;
  answers: Record<string, Answer>;
  flagged: string[];
  /** Immediate-feedback mode: questions the student has checked; their answers are locked. Absent on attempts from 0.4.0. */
  checked?: string[];
  startedAt: number;
  /** Absolute deadline when the quiz has a time limit. */
  deadline: number | null;
  submittedAt: number | null;
  /** true when submitted automatically because time ran out. */
  timedOut: boolean;
  result: AttemptResult | null;
}
