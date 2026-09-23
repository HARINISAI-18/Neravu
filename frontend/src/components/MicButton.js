import React, { useEffect, useState } from "react";
import {
  TouchableOpacity,
  Text,
  Alert,
} from "react-native";

import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";

import { speechToText } from "../api";

export default function MicButton({ onText }) {
  const recorder = useAudioRecorder(
    RecordingPresets.HIGH_QUALITY
  );

  const recorderState = useAudioRecorderState(recorder);

  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    async function setup() {
      try {
        const permission =
          await requestRecordingPermissionsAsync();

        console.log(
          "Microphone permission:",
          permission.granted
        );

        if (!permission.granted) {
          console.warn("Microphone permission denied");
          return;
        }

        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
      } catch (error) {
        console.error(
          "Microphone setup error:",
          error
        );
      }
    }

    setup();
  }, []);

  async function startRecording() {
    try {
      if (processing || recorderState.isRecording) {
        return;
      }

      const permission =
        await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Microphone Permission",
          "Please allow microphone access in your browser."
        );
        return;
      }

      console.log("🎙️ Preparing recorder...");

      await recorder.prepareToRecordAsync();

      recorder.record();

      console.log("🎙️ Recording started");
    } catch (error) {
      console.error(
        "Start recording error:",
        error
      );

      Alert.alert(
        "Microphone Error",
        "Could not start recording. Please check your browser microphone permission."
      );
    }
  }

  async function stopRecording() {
    try {
      if (!recorderState.isRecording) {
        return;
      }

      setProcessing(true);

      console.log("🛑 Stopping recording...");

      await recorder.stop();

      const uri = recorder.uri;

      console.log("🎧 Recording URI:", uri);

      if (!uri) {
        throw new Error(
          "Recording URI was not created."
        );
      }

      console.log(
        "📤 Sending audio to /api/stt..."
      );

      const result = await speechToText(uri);

      console.log(
        "📝 Speech-to-text response:",
        result
      );

      if (result?.text?.trim()) {
        const text = result.text.trim();

        console.log(
          "✅ Transcribed text:",
          text
        );

        onText(text);
      } else {
        Alert.alert(
          "No speech detected",
          "I couldn't understand the recording. Please try again."
        );
      }
    } catch (error) {
      console.error(
        "Speech-to-text error:",
        error
      );

      Alert.alert(
        "Voice Input Failed",
        error?.message ||
          "Could not convert your speech to text."
      );
    } finally {
      setProcessing(false);
    }
  }

  function handlePress() {
    if (processing) {
      return;
    }

    if (recorderState.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  const isRecording =
    recorderState.isRecording;

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={processing}
      accessibilityRole="button"
      accessibilityLabel={
        isRecording
          ? "Stop recording"
          : "Start voice input"
      }
      style={{
        width: 46,
        height: 46,
        borderRadius: 23,

        justifyContent: "center",
        alignItems: "center",

        backgroundColor: processing
          ? "#94A3B8"
          : isRecording
          ? "#EF4444"
          : "#0E7490",

        opacity: processing ? 0.7 : 1,
      }}
    >
      <Text style={{ fontSize: 20 }}>
        {processing
          ? "⏳"
          : isRecording
          ? "⏹️"
          : "🎙️"}
      </Text>
    </TouchableOpacity>
  );
}