import React, { useState, useRef } from "react";
import { TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { Audio } from "expo-av";
import { getTtsUrl } from "../api";

export default function SpeakerButton({ text, lang, size = 26 }) {
  const [state, setState] = useState("idle"); // idle | loading | playing
  const soundRef = useRef();

  async function onPress() {
    if (state === "playing") {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
      setState("idle");
      return;
    }
    try {
      setState("loading");
      const url = await getTtsUrl(text, lang);
      const { sound } = await Audio.Sound.createAsync({ uri: url });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate(s => { if (s.didJustFinish) setState("idle"); });
      setState("playing");
      await sound.playAsync();
    } catch (e) { setState("idle"); }
  }

  return (
    <TouchableOpacity onPress={onPress} style={{ padding: 6 }}>
      {state === "loading"
        ? <ActivityIndicator size="small" />
        : <Text style={{ fontSize: size }}>{state === "playing" ? "⏸" : "🔊"}</Text>}
    </TouchableOpacity>
  );
}