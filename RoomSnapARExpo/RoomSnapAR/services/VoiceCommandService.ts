import * as Speech from 'expo-speech';
import { Audio, type AudioRecording, type RecordingOptions } from 'expo-audio';
import { Platform } from 'react-native';

export interface VoiceCommand {
  command: string;
  action: string;
  parameters?: any;
  confidence: number;
}

type CommandCallback = (command: VoiceCommand) => void;

export class VoiceCommandService {
  private static instance: VoiceCommandService;
  private recording: AudioRecording | null = null;
  private isListening: boolean = false;
  private commandCallbacks: CommandCallback[] = [];
  
  private commands = {
    'measure': { action: 'start_measure', aliases: ['measure', 'start measuring', 'measure distance'] },
    'place': { action: 'place_object', aliases: ['place', 'add', 'put', 'drop'] },
    'sofa': { action: 'place_sofa', aliases: ['sofa', 'couch', 'settee'] },
    'table': { action: 'place_table', aliases: ['table', 'desk', 'coffee table'] },
    'chair': { action: 'place_chair', aliases: ['chair', 'seat', 'stool'] },
    'bed': { action: 'place_bed', aliases: ['bed', 'mattress'] },
    'delete': { action: 'delete_object', aliases: ['delete', 'remove', 'clear', 'erase'] },
    'undo': { action: 'undo', aliases: ['undo', 'back', 'revert'] },
    'redo': { action: 'redo', aliases: ['redo', 'forward', 'repeat'] },
    'save': { action: 'save_session', aliases: ['save', 'store', 'keep'] },
    'export': { action: 'export', aliases: ['export', 'share', 'send'] },
    'help': { action: 'show_help', aliases: ['help', 'what can you do', 'commands'] },
    'stop': { action: 'stop_listening', aliases: ['stop', 'stop listening', 'quiet'] },
    'screenshot': { action: 'take_screenshot', aliases: ['screenshot', 'capture', 'snap', 'photo'] },
    'clear all': { action: 'clear_all', aliases: ['clear all', 'reset', 'start over'] },
    'switch units': { action: 'toggle_units', aliases: ['switch units', 'change units', 'metric', 'imperial'] },
    'grid': { action: 'toggle_grid', aliases: ['grid', 'toggle grid', 'show grid', 'hide grid'] },
  };

  static getInstance(): VoiceCommandService {
    if (!VoiceCommandService.instance) {
      VoiceCommandService.instance = new VoiceCommandService();
    }
    return VoiceCommandService.instance;
  }

  async initialize(): Promise<void> {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Microphone permission not granted');
      }
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
    } catch (error) {
      console.error('Failed to initialize voice commands:', error);
    }
  }

  async startListening(callback: CommandCallback): Promise<void> {
    if (this.isListening) return;
    
    this.commandCallbacks.push(callback);
    this.isListening = true;
    
    try {
      // Start recording
      const recordingOptions: RecordingOptions = {
        isMeteringEnabled: true,
        android: {
          extension: '.m4a',
          outputFormat: 'mpeg4',
          audioEncoder: 'aac',
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: 'mpeg4aac',
          audioQuality: 127,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      };
      const { recording } = await Audio.Recording.createAsync(recordingOptions);
      this.recording = recording;
      
      // Process voice in real-time (simplified for demo)
      setTimeout(() => this.processVoiceInput(), 3000);
      
      this.speak('Voice commands activated. Say a command.');
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.isListening = false;
    }
  }

  async stopListening(): Promise<void> {
    if (!this.isListening || !this.recording) return;
    
    try {
      await this.recording.stopAndUnloadAsync();
      this.recording = null;
      this.isListening = false;
      this.commandCallbacks = [];
      
      this.speak('Voice commands deactivated.');
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }

  private async processVoiceInput(): Promise<void> {
    if (!this.recording) return;
    
    try {
      // In production, this would use speech-to-text API
      // For demo, simulate command recognition
      const simulatedTranscript = this.simulateTranscription();
      const command = this.parseCommand(simulatedTranscript);
      
      if (command) {
        this.executeCommand(command);
        
        // Continue listening
        if (this.isListening && command.action !== 'stop_listening') {
          setTimeout(() => this.processVoiceInput(), 2000);
        }
      }
    } catch (error) {
      console.error('Failed to process voice input:', error);
    }
  }

  private simulateTranscription(): string {
    // Simulate different voice commands for demo
    const sampleCommands = [
      'measure distance',
      'place sofa',
      'add table',
      'delete',
      'undo',
      'save',
      'take screenshot',
      'toggle grid',
      'help',
    ];
    
    return sampleCommands[Math.floor(Math.random() * sampleCommands.length)];
  }

  private parseCommand(transcript: string): VoiceCommand | null {
    const lowerTranscript = transcript.toLowerCase().trim();
    
    for (const [key, config] of Object.entries(this.commands)) {
      for (const alias of config.aliases) {
        if (lowerTranscript.includes(alias)) {
          // Extract parameters (e.g., "place sofa" -> { type: 'sofa' })
          const parameters = this.extractParameters(lowerTranscript, config.action);
          
          return {
            command: lowerTranscript,
            action: config.action,
            parameters,
            confidence: 0.85 + Math.random() * 0.15,
          };
        }
      }
    }
    
    return null;
  }

  private extractParameters(transcript: string, action: string): any {
    const params: any = {};
    
    if (action.startsWith('place_')) {
      // Extract furniture type
      const furnitureTypes = ['sofa', 'table', 'chair', 'bed', 'desk', 'wardrobe'];
      for (const type of furnitureTypes) {
        if (transcript.includes(type)) {
          params.furnitureType = type;
          break;
        }
      }
    }
    
    // Extract numbers (for dimensions, etc.)
    const numbers = transcript.match(/\d+/g);
    if (numbers) {
      params.values = numbers.map(n => parseInt(n));
    }
    
    // Extract position words
    if (transcript.includes('left')) params.position = 'left';
    if (transcript.includes('right')) params.position = 'right';
    if (transcript.includes('center')) params.position = 'center';
    if (transcript.includes('corner')) params.position = 'corner';
    
    return Object.keys(params).length > 0 ? params : undefined;
  }

  private executeCommand(command: VoiceCommand): void {
    // Notify all registered callbacks
    this.commandCallbacks.forEach(callback => callback(command));
    
    // Provide audio feedback
    const feedback = this.getCommandFeedback(command);
    this.speak(feedback);
  }

  private getCommandFeedback(command: VoiceCommand): string {
    const feedbackMap: { [key: string]: string } = {
      'start_measure': 'Starting measurement. Tap two points.',
      'place_object': 'Select furniture type and tap to place.',
      'place_sofa': 'Placing sofa. Tap to position.',
      'place_table': 'Placing table. Tap to position.',
      'place_chair': 'Placing chair. Tap to position.',
      'place_bed': 'Placing bed. Tap to position.',
      'delete_object': 'Select object to delete.',
      'undo': 'Undoing last action.',
      'redo': 'Redoing action.',
      'save_session': 'Saving current session.',
      'export': 'Exporting session data.',
      'show_help': 'Available commands: measure, place, delete, undo, save, export, screenshot.',
      'stop_listening': 'Stopping voice commands.',
      'take_screenshot': 'Capturing screenshot.',
      'clear_all': 'Clearing all objects.',
      'toggle_units': 'Switching measurement units.',
      'toggle_grid': 'Toggling grid display.',
    };
    
    return feedbackMap[command.action] || `Executing ${command.action}`;
  }

  speak(text: string, options?: Speech.SpeechOptions): void {
    Speech.speak(text, {
      language: 'en-US',
      pitch: 1.0,
      rate: 1.0,
      ...options,
    });
  }

  async isSpeaking(): Promise<boolean> {
    return await Speech.isSpeakingAsync();
  }

  stop(): void {
    Speech.stop();
  }

  getAvailableCommands(): string[] {
    return Object.values(this.commands).flatMap(c => c.aliases);
  }

  // Quick command shortcuts
  async measureDistance(): Promise<void> {
    this.executeCommand({
      command: 'measure distance',
      action: 'start_measure',
      confidence: 1.0,
    });
  }

  async placeObject(type: string): Promise<void> {
    this.executeCommand({
      command: `place ${type}`,
      action: `place_${type}`,
      parameters: { furnitureType: type },
      confidence: 1.0,
    });
  }

  async quickSave(): Promise<void> {
    this.executeCommand({
      command: 'save',
      action: 'save_session',
      confidence: 1.0,
    });
  }
}