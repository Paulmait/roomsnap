import { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';

interface UndoRedoState<T> {
  current: T;
  history: T[];
  future: T[];
}

export function useUndoRedo<T>(initialState: T, enableHaptics = true) {
  const [state, setState] = useState<UndoRedoState<T>>({
    current: initialState,
    history: [],
    future: [],
  });

  const canUndo = state.history.length > 0;
  const canRedo = state.future.length > 0;

  const pushState = useCallback((newState: T) => {
    setState((prev) => ({
      current: newState,
      history: [...prev.history, prev.current],
      future: [],
    }));
    if (enableHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [enableHaptics]);

  const undo = useCallback(() => {
    if (!canUndo) return;
    
    setState((prev) => {
      const newHistory = [...prev.history];
      const previousState = newHistory.pop()!;
      
      return {
        current: previousState,
        history: newHistory,
        future: [prev.current, ...prev.future],
      };
    });
    
    if (enableHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [canUndo, enableHaptics]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    
    setState((prev) => {
      const newFuture = [...prev.future];
      const nextState = newFuture.shift()!;
      
      return {
        current: nextState,
        history: [...prev.history, prev.current],
        future: newFuture,
      };
    });
    
    if (enableHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [canRedo, enableHaptics]);

  const reset = useCallback(() => {
    setState({
      current: initialState,
      history: [],
      future: [],
    });
  }, [initialState]);

  return {
    state: state.current,
    pushState,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
    historyLength: state.history.length,
    futureLength: state.future.length,
  };
}