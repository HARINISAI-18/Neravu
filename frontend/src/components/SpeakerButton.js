import React, { useState, useRef, useEffect } from "react";
import { TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { createAudioPlayer } from "expo-audio";
import { getTtsUrl } from "../api";

export default function SpeakerButton({ text, lang, size = 26 }) {
  const [state, setState] = useState("idle"); // idle | loading | playing
  const playerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.remove();
      }
    };
  }, []);

  async function onPress() {
    if (state === "playing") {
      playerRef.current?.pause();
      setState("idle");
      return;
    }

    try {
      setState("loading");
      const url = await getTtsUrl(text, lang);

      if (playerRef.current) {
        playerRef.current.remove();
      }

      const player = createAudioPlayer(url);
      playerRef.current = player;

      player.addListener('playbackStatusUpdate', (s) => {
        if (s.didJustFinish) {
          setState("idle");
        }
      });

      setState("playing");
      player.play();
    } catch (e) {
      console.warn("TTS Play error:", e);
      setState("idle");
    }
  }

  return (
    <TouchableOpacity onPress={onPress} style={{ padding: 6 }}>
      {state === "loading"
        ? <ActivityIndicator size="small" />
        : <Text style={{ fontSize: size }}>{state === "playing" ? "⏸" : "🔊"}</Text>}
    </TouchableOpacity>
  );
}