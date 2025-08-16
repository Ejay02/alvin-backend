import { Injectable } from '@nestjs/common';
import {
  GeminiService,
  InterviewConfig,
  InterviewQuestion,
} from '../openai/gemini.service';
import { v4 as uuidv4 } from 'uuid';

export interface InterviewSession {
  id: string;
  config: InterviewConfig;
  questions: InterviewQuestion[];
  answers: Array<{
    questionId: string;
    question: string;
    answer: string;
    feedback?: string;
    score?: number;
    timestamp: Date;
  }>;
  currentQuestionIndex: number;
  status: 'active' | 'completed';
  startTime: Date;
  endTime?: Date;
}

@Injectable()
export class InterviewService {
  private sessions: Map<string, InterviewSession> = new Map();

  constructor(private readonly geminiService: GeminiService) {}

  async startInterview(config: InterviewConfig): Promise<{
    interviewId: string;
    greeting: { greeting: string; followUp: string };
    isGreeting: boolean;
  }> {
    const interviewId = uuidv4();

    // Generate personalized greeting instead of first question
    const greeting = await this.geminiService.generatePersonalizedGreeting(config);

    const session: InterviewSession = {
      id: interviewId,
      config,
      questions: [],
      answers: [],
      currentQuestionIndex: -1, // Start at -1 to indicate greeting phase
      status: 'active',
      startTime: new Date(),
    };

    this.sessions.set(interviewId, session);

    return {
      interviewId,
      greeting,
      isGreeting: true,
    };
  }

  async submitAnswer(
    interviewId: string,
    answer: string,
    questionId: string,
  ): Promise<{
    feedback?: string;
    score?: number;
    nextQuestion?: InterviewQuestion;
    isComplete?: boolean;
    isGreetingResponse?: boolean;
  }> {
    const session = this.sessions.get(interviewId);
    if (!session || session.status !== 'active') {
      throw new Error('Interview session not found or not active');
    }

    // Handle greeting response (when currentQuestionIndex is -1)
    if (session.currentQuestionIndex === -1) {
      // Generate first actual interview question
      const firstQuestion = await this.geminiService.generateInterviewQuestion(
        session.config,
        [`Greeting response: ${answer}`],
        1,
      );
      
      session.questions.push(firstQuestion);
      session.currentQuestionIndex = 0;
      
      return {
        nextQuestion: firstQuestion,
        isComplete: false,
        isGreetingResponse: true,
      };
    }

    const currentQuestion = session.questions[session.currentQuestionIndex];

    // Evaluate the answer
    const evaluation = await this.geminiService.evaluateAnswer(
      currentQuestion.question,
      answer,
      session.config,
    );

    // Store the answer and feedback
    session.answers.push({
      questionId,
      question: currentQuestion.question,
      answer,
      feedback: evaluation.feedback,
      score: evaluation.score,
      timestamp: new Date(),
    });

    // Check if interview should continue (max 10 questions)
    const shouldContinue = session.answers.length < 10;

    if (shouldContinue) {
      // Generate next question
      const conversationHistory = this.buildConversationHistory(session);
      const nextQuestion = await this.geminiService.generateInterviewQuestion(
        session.config,
        conversationHistory,
        session.answers.length + 1,
      );

      session.questions.push(nextQuestion);
      session.currentQuestionIndex++;

      return {
        feedback: evaluation.feedback,
        score: evaluation.score,
        nextQuestion,
      };
    } else {
      // End interview
      session.status = 'completed';
      session.endTime = new Date();

      return {
        feedback: evaluation.feedback,
        score: evaluation.score,
        isComplete: true,
      };
    }
  }

  async getNextQuestion(
    interviewId: string,
  ): Promise<InterviewQuestion | null> {
    const session = this.sessions.get(interviewId);
    if (!session || session.status !== 'active') {
      return null;
    }

    return session.questions[session.currentQuestionIndex] || null;
  }

  async getTranscript(interviewId: string): Promise<{
    config: InterviewConfig;
    questions: InterviewQuestion[];
    answers: InterviewSession['answers'];
    summary: {
      totalQuestions: number;
      averageScore: number;
      duration: string;
      status: string;
    };
  } | null> {
    const session = this.sessions.get(interviewId);
    if (!session) {
      return null;
    }

    const duration = session.endTime
      ? this.calculateDuration(session.startTime, session.endTime)
      : this.calculateDuration(session.startTime, new Date());

    const averageScore =
      session.answers.length > 0
        ? session.answers.reduce(
            (sum, answer) => sum + (answer.score || 0),
            0,
          ) / session.answers.length
        : 0;

    return {
      config: session.config,
      questions: session.questions,
      answers: session.answers,
      summary: {
        totalQuestions: session.answers.length,
        averageScore: Math.round(averageScore * 10) / 10,
        duration,
        status: session.status,
      },
    };
  }

  async endInterview(interviewId: string): Promise<{ success: boolean }> {
    const session = this.sessions.get(interviewId);
    if (!session) {
      return { success: false };
    }

    session.status = 'completed';
    session.endTime = new Date();

    return { success: true };
  }

  private buildConversationHistory(session: InterviewSession): string[] {
    const history: string[] = [];

    session.answers.forEach((answer, index) => {
      history.push(`Q${index + 1}: ${answer.question}`);
      history.push(`A${index + 1}: ${answer.answer}`);
      if (answer.feedback) {
        history.push(`Feedback: ${answer.feedback}`);
      }
    });

    return history;
  }

  private calculateDuration(start: Date, end: Date): string {
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);

    return `${diffMins}m ${diffSecs}s`;
  }
}
