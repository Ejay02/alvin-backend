import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface InterviewConfig {
  candidateName: string;
  jobTitle: string;
  difficulty: 'junior' | 'mid' | 'senior';
  questionTypes: string[];
  companyName?: string;
}

export interface InterviewQuestion {
  question: string;
  category: string;
  followUp?: string;
}

@Injectable()
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async generatePersonalizedGreeting(
    config: InterviewConfig,
  ): Promise<{ greeting: string; followUp: string }> {
    const systemPrompt = `You are L, a friendly and professional AI interview assistant. 
    You are about to conduct an interview for a ${config.jobTitle} position.
    Create a warm, personalized greeting that makes the candidate feel comfortable.`;

    const userPrompt = `Generate a personalized greeting for ${config.candidateName}.
    
    The greeting should:
    1. Introduce yourself as "L, your private AI interview assistant"
    2. Use their name warmly
    3. Ask "How are you today?" in a natural way
    4. Briefly mention the interview process
    5. Be encouraging and set a positive tone
    
    IMPORTANT: Respond ONLY with valid JSON in this exact format:
    {
      "greeting": "your personalized greeting here",
      "followUp": "a follow-up question or comment to keep the conversation flowing"
    }
    
    Do not include any other text or explanation outside the JSON.`;

    try {
      const prompt = `${systemPrompt}\n\n${userPrompt}`;
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const responseContent = response.text();

      if (!responseContent) {
        throw new Error(
          'Gemini API returned empty response for greeting generation',
        );
      }
      return this.parseGreetingResponse(responseContent);
    } catch (error) {
      console.error('Error generating personalized greeting:', error);
      throw new Error('Failed to generate personalized greeting');
    }
  }

  async generateInterviewQuestion(
    config: InterviewConfig,
    conversationHistory: string[],
    currentQuestionNumber: number,
  ): Promise<InterviewQuestion> {
    const systemPrompt = this.buildSystemPrompt(config);
    const userPrompt = this.buildUserPrompt(
      config,
      conversationHistory,
      currentQuestionNumber,
    );

    try {
      const prompt = `${systemPrompt}\n\n${userPrompt}`;
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const responseContent = response.text();

      if (!responseContent) {
        throw new Error(
          'Gemini API returned empty response for question generation',
        );
      }
      return this.parseQuestionResponse(responseContent);
    } catch (error) {
      console.error('Error generating interview question:', error);
      throw new Error('Failed to generate interview question');
    }
  }

  async evaluateAnswer(
    question: string,
    answer: string,
    config: InterviewConfig,
  ): Promise<{ feedback: string; score: number; followUpQuestion?: string }> {
    const systemPrompt = `You are an expert technical interviewer evaluating a candidate's response. 
    Provide constructive feedback and a score from 1-10. Be encouraging but honest.
    Job Level: ${config.difficulty}
    Job Title: ${config.jobTitle}`;

    const userPrompt = `Question: ${question}

Candidate's Answer: ${answer}

Please evaluate this answer and provide:
    1. Brief feedback (2-3 sentences)
    2. Score (1-10)
    3. A follow-up question (optional, if the answer was incomplete or could be expanded upon)
    4. The category/type of the follow-up question (if provided)

    IMPORTANT: Respond ONLY with valid JSON in this exact format:
    {
      "feedback": "your feedback here",
      "score": 8,
      "followUpQuestion": "optional follow-up question",
      "followUpCategory": "category if follow-up provided"
    }
    
    Do not include any other text or explanation outside the JSON.`;

    try {
      const prompt = `${systemPrompt}\n\n${userPrompt}`;
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const responseContent = response.text();

      if (!responseContent) {
        throw new Error(
          'Gemini API returned empty response for answer evaluation',
        );
      }
      const cleanedResponse = this.extractJSON(responseContent);
      return JSON.parse(cleanedResponse);
    } catch (error) {
      console.error('Error evaluating answer:', error);
      throw new Error('Failed to evaluate answer');
    }
  }

  private buildSystemPrompt(config: InterviewConfig): string {
    return `You are an experienced technical interviewer conducting a ${config.difficulty}-level interview for a ${config.jobTitle} position.
    
    Guidelines:
    - Ask relevant, practical questions appropriate for the ${config.difficulty} level
    - Focus on these areas: ${config.questionTypes.join(', ')}
    - Be professional but friendly
    - Ask one question at a time
    - Vary question types (technical, behavioral, problem-solving)
    - Consider the candidate's experience level
    
    Candidate: ${config.candidateName}
    Company: ${config.companyName || 'the company'}`;
  }

  private buildUserPrompt(
    config: InterviewConfig,
    conversationHistory: string[],
    currentQuestionNumber: number,
  ): string {
    let prompt = `Generate interview question #${currentQuestionNumber} for ${config.candidateName}.\n\n`;

    if (conversationHistory.length > 0) {
      prompt += `Previous conversation:\n${conversationHistory.slice(-4).join('\n')}\n\n`;
    }

    prompt += `Please provide:
    1. A clear, specific question
    2. The category/type of question
    
    IMPORTANT: Respond ONLY with valid JSON in this exact format:
    {
      "question": "your question here",
      "category": "technical/behavioral/problem-solving/etc"
    }
    
    Do not include any other text or explanation outside the JSON.`;

    return prompt;
  }

  private parseGreetingResponse(response: string): { greeting: string; followUp: string } {
    try {
      // Clean the response to extract JSON
      const cleanedResponse = this.extractJSON(response);
      const parsed = JSON.parse(cleanedResponse);
      return {
        greeting: parsed.greeting || `Hello! I'm L, your private AI interview assistant. How are you today?`,
        followUp: parsed.followUp || 'I'm excited to help you practice your interview skills today!',
      };
    } catch (error) {
      console.warn('Failed to parse greeting JSON response:', error);
      // Fallback if JSON parsing fails
      return {
        greeting: `Hello! I'm L, your private AI interview assistant. How are you today?`,
        followUp: 'I'm excited to help you practice your interview skills today!',
      };
    }
  }

  private parseQuestionResponse(response: string): InterviewQuestion {
    try {
      // Clean the response to extract JSON
      const cleanedResponse = this.extractJSON(response);
      const parsed = JSON.parse(cleanedResponse);
      return {
        question: parsed.question || 'Can you tell me about yourself?',
        category: parsed.category || 'general',
      };
    } catch (error) {
      console.warn('Failed to parse JSON response:', error);
      // Fallback if JSON parsing fails
      return {
        question: response.trim() || 'Can you tell me about yourself?',
        category: 'general',
      };
    }
  }

  private extractJSON(text: string): string {
    // Try to find JSON object in the response
    const jsonMatch = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
    return jsonMatch ? jsonMatch[0] : text;
  }
}
