import type { ContentKind } from '../db/db';

/** 1.1.0: the three groups the learner environment serves. Each sees content of the matching kind. */
export type LearnerType = 'school' | 'university' | 'trainee';

export const LEARNER_TYPE_LABEL: Record<LearnerType, string> = {
  school: 'طالب مدرسة',
  university: 'طالب جامعي',
  trainee: 'معلم متدرب',
};

export const CONTENT_FOR: Record<LearnerType, ContentKind> = { school: 'school', university: 'university', trainee: 'training' };

/** A learner's profile on this device (table `learners`, key = normalised name, same key as attempts and progress). */
export interface LearnerProfile {
  key: string;
  name: string;
  type: LearnerType;
  /** School / university number or trainee code. Optional. */
  learnerId: string;
  /** Grade (school), specialization (university) or specialization/subject taught (trainee). */
  grade: string;
  specialization: string;
  /** Academic level (university) or years of experience/stage (trainee). */
  level: string;
  /** Content the learner is enrolled in. Empty = every published item of the matching kind. */
  assigned: string[];
  createdAt: number;
  updatedAt: number;
}

/** Stored status of an assignment answer. «لم يبدأ» and «قيد الإنجاز» are worked out, not stored. */
export type SubmissionStatus = 'draft' | 'submitted' | 'graded';
export type AssignmentState = 'not_started' | 'in_progress' | SubmissionStatus;

export const ASSIGNMENT_STATE_LABEL: Record<AssignmentState, string> = {
  not_started: 'لم يبدأ',
  draft: 'مسودة',
  in_progress: 'قيد الإنجاز',
  submitted: 'تم التسليم',
  graded: 'تم التقييم',
};

export interface SubmissionFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  data: ArrayBuffer;
}

/** A learner's answer to an assignment activity (table `submissions`). Stays on this device. */
export interface Submission {
  /** `${studentKey}|${lessonId}|${blockId}` */
  id: string;
  studentKey: string;
  studentName: string;
  projectId: string;
  lessonId: string;
  blockId: string;
  /** Activity title at the time of saving, for lists that do not load the lesson. */
  title: string;
  answer: string;
  files: SubmissionFile[];
  status: SubmissionStatus;
  createdAt: number;
  updatedAt: number;
  submittedAt: number | null;
  /** Teacher's evaluation (0–100), set only by the teacher in «النتائج». */
  score: number | null;
  feedback: string;
  gradedAt: number | null;
}
