import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../lib/theme';
import { useGigDraftStore } from '../../stores/gigDraft';

type ScheduleMode = 'anytime' | 'pick';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6 AM to 9 PM

function formatHour(h: number) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:00 ${suffix}`;
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

export function StepSchedule() {
  const { draft, updateDraft } = useGigDraftStore();
  const now = new Date();
  const [mode, setMode] = useState<ScheduleMode>(draft.scheduled_for === null ? 'anytime' : 'pick');

  // Calendar state
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number>(now.getDate());
  const [selectedHour, setSelectedHour] = useState<number>(8);

  // Init from existing draft
  useState(() => {
    if (draft.scheduled_for) {
      const d = new Date(draft.scheduled_for);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setSelectedDay(d.getDate());
      setSelectedHour(d.getHours());
    }
  });

  function handleAnytime() {
    setMode('anytime');
    updateDraft({ scheduled_for: null });
  }

  function handlePickMode() {
    setMode('pick');
    applyDateTime(viewYear, viewMonth, selectedDay, selectedHour);
  }

  function applyDateTime(year: number, month: number, day: number, hour: number) {
    const dt = new Date(year, month, day, hour, 0, 0, 0);
    updateDraft({ scheduled_for: dt.toISOString() });
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  function selectDate(day: number) {
    setSelectedDay(day);
    applyDateTime(viewYear, viewMonth, day, selectedHour);
  }

  function selectHour(hour: number) {
    setSelectedHour(hour);
    applyDateTime(viewYear, viewMonth, selectedDay, hour);
  }

  const calendarDays = getCalendarDays(viewYear, viewMonth);
  const today = new Date();
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Can't go before current month
  const canGoPrev = viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth > today.getMonth());

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 6 }}>
          When?
        </Text>
        <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 22 }}>
          Choose a time that works best for you.
        </Text>
      </View>

      {/* Job title + description — tap mic on keyboard to dictate */}
      <View style={{ paddingHorizontal: 20, marginBottom: 20, gap: 10 }}>
        <TextInput
          value={draft.gig_title}
          onChangeText={(v) => updateDraft({ gig_title: v })}
          placeholder="Job title (e.g. 2BR move + piano)"
          placeholderTextColor={colors.ink4}
          style={{
            height: 52, paddingHorizontal: 16, borderRadius: radii.md,
            backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line,
            fontSize: 15, fontWeight: '600', color: colors.ink,
          }}
        />
        <TextInput
          value={draft.gig_description}
          onChangeText={(v) => updateDraft({ gig_description: v })}
          placeholder="Describe the job — tap the mic key on your keyboard to dictate"
          placeholderTextColor={colors.ink4}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          style={{
            minHeight: 88, paddingHorizontal: 16, paddingTop: 14,
            borderRadius: radii.md, backgroundColor: colors.card,
            borderWidth: 1.5, borderColor: colors.line,
            fontSize: 14, color: colors.ink, lineHeight: 20,
          }}
        />
      </View>

      {/* Mode selector */}
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        <TouchableOpacity
          onPress={handleAnytime}
          activeOpacity={0.7}
          style={{
            padding: 16,
            backgroundColor: mode === 'anytime' ? colors.accent.soft : colors.card,
            borderWidth: 2,
            borderColor: mode === 'anytime' ? colors.accent.base : 'transparent',
            borderRadius: radii.lg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <View style={{
            width: 44, height: 44, borderRadius: 12,
            backgroundColor: mode === 'anytime' ? colors.accent.base : colors.surface,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="flash-outline" size={24} color={mode === 'anytime' ? '#fff' : colors.ink2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 }}>Anytime</Text>
            <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>Flexible — worker picks the time</Text>
          </View>
          {mode === 'anytime' && (
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent.base, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={14} color="#fff" />
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handlePickMode}
          activeOpacity={0.7}
          style={{
            padding: 16,
            backgroundColor: mode === 'pick' ? colors.accent.soft : colors.card,
            borderWidth: 2,
            borderColor: mode === 'pick' ? colors.accent.base : 'transparent',
            borderRadius: radii.lg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <View style={{
            width: 44, height: 44, borderRadius: 12,
            backgroundColor: mode === 'pick' ? colors.accent.base : colors.surface,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="calendar-outline" size={24} color={mode === 'pick' ? '#fff' : colors.ink2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 }}>Pick a date & time</Text>
            <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>Choose a specific day and hour</Text>
          </View>
          {mode === 'pick' && (
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent.base, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={14} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Calendar + time picker */}
      {mode === 'pick' && (
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          {/* Month navigation */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <TouchableOpacity onPress={prevMonth} disabled={!canGoPrev} style={{ padding: 8 }}>
              <Ionicons name="chevron-back" size={22} color={canGoPrev ? colors.ink : colors.ink4} />
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>{monthLabel}</Text>
            <TouchableOpacity onPress={nextMonth} style={{ padding: 8 }}>
              <Ionicons name="chevron-forward" size={22} color={colors.ink} />
            </TouchableOpacity>
          </View>

          {/* Weekday headers */}
          <View style={{ flexDirection: 'row', marginBottom: 8 }}>
            {WEEKDAYS.map((d) => (
              <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink4 }}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 }}>
            {calendarDays.map((day, idx) => {
              if (day === null) {
                return <View key={`empty-${idx}`} style={{ width: `${100 / 7}%`, height: 44 }} />;
              }
              const date = new Date(viewYear, viewMonth, day);
              const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
              const isSelected = day === selectedDay && viewMonth === new Date(viewYear, viewMonth, selectedDay).getMonth();
              const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
              return (
                <View key={day} style={{ width: `${100 / 7}%`, alignItems: 'center', marginBottom: 4 }}>
                  <TouchableOpacity
                    onPress={() => !isPast && selectDate(day)}
                    disabled={isPast}
                    activeOpacity={0.7}
                    style={{
                      width: 40, height: 40, borderRadius: 20,
                      backgroundColor: isSelected ? colors.accent.base : 'transparent',
                      borderWidth: isToday && !isSelected ? 1.5 : 0,
                      borderColor: colors.accent.base,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Text style={{
                      fontSize: 15, fontWeight: isSelected || isToday ? '700' : '500',
                      color: isPast ? colors.ink4 : isSelected ? '#fff' : colors.ink,
                    }}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {/* Time picker */}
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink2, marginBottom: 10 }}>
            Time
          </Text>
          <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled showsVerticalScrollIndicator>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {HOURS.map((h) => {
                const isSelected = selectedHour === h;
                return (
                  <TouchableOpacity
                    key={h}
                    onPress={() => selectHour(h)}
                    activeOpacity={0.7}
                    style={{
                      width: '30%',
                      paddingVertical: 12,
                      alignItems: 'center',
                      backgroundColor: isSelected ? colors.accent.base : colors.card,
                      borderWidth: 1.5,
                      borderColor: isSelected ? colors.accent.base : colors.line,
                      borderRadius: radii.md,
                    }}
                  >
                    <Text style={{
                      fontSize: 14, fontWeight: '600',
                      color: isSelected ? '#fff' : colors.ink,
                    }}>
                      {formatHour(h)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Selected summary */}
          <View style={{
            marginTop: 16, padding: 14, borderRadius: 14,
            backgroundColor: colors.sage.soft, flexDirection: 'row', gap: 10, alignItems: 'center',
          }}>
            <Ionicons name="calendar" size={18} color={colors.sage.deep} />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.sage.deep }}>
              {new Date(viewYear, viewMonth, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at {formatHour(selectedHour)}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
