import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../lib/theme';

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    postcode?: string;
    city?: string;
    state?: string;
  };
}

interface AddressAutocompleteProps {
  value: string;
  onSelect: (result: {
    address: string;
    lat: number;
    lng: number;
    zip: string | null;
  }) => void;
  placeholder?: string;
  style?: any;
}

export function AddressAutocomplete({ value, onSelect, placeholder, style }: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value changes
  const lastSelectedRef = useRef(value);
  if (value !== lastSelectedRef.current && value !== query) {
    setQuery(value);
    lastSelectedRef.current = value;
  }

  const search = useCallback(async (text: string) => {
    if (text.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: text,
        format: 'json',
        addressdetails: '1',
        limit: '5',
        countrycodes: 'us',
        viewbox: '-98.2,30.8,-97.3,30.0', // Austin, TX area bias
        bounded: '0',
      });

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        {
          headers: {
            'User-Agent': 'FastFixWork/1.0',
            'Accept-Language': 'en',
          },
        }
      );
      const data: Suggestion[] = await res.json();
      setSuggestions(data);
      setShowDropdown(data.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChangeText(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(text), 400);
  }

  function handleSelect(item: Suggestion) {
    // Build a clean short address
    const shortAddress = formatAddress(item);
    setQuery(shortAddress);
    setSuggestions([]);
    setShowDropdown(false);
    lastSelectedRef.current = shortAddress;
    Keyboard.dismiss();

    onSelect({
      address: shortAddress,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      zip: item.address?.postcode || null,
    });
  }

  return (
    <View style={style}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          value={query}
          onChangeText={handleChangeText}
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
          placeholder={placeholder}
          placeholderTextColor={colors.ink4}
          style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink, padding: 0 }}
          autoCorrect={false}
        />
        {loading && <ActivityIndicator size="small" color={colors.accent.base} />}
      </View>

      {showDropdown && suggestions.length > 0 && (
        <View style={{
          position: 'absolute',
          top: '100%',
          left: -14,
          right: -14,
          zIndex: 999,
          backgroundColor: colors.card,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: colors.line,
          marginTop: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
          elevation: 8,
        }}>
          {suggestions.map((item, i) => (
            <TouchableOpacity
              key={`${item.lat}-${item.lon}-${i}`}
              onPress={() => handleSelect(item)}
              style={{
                padding: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderTopWidth: i > 0 ? 1 : 0,
                borderTopColor: colors.line,
              }}
            >
              <Ionicons name="location-outline" size={16} color={colors.ink3} />
              <Text style={{ flex: 1, fontSize: 14, color: colors.ink }} numberOfLines={2}>
                {formatAddress(item)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function formatAddress(item: Suggestion): string {
  // Try to build a concise address from the display_name
  // Nominatim display_name is verbose: "123 Main St, Austin, Travis County, Texas, 78701, United States"
  // We want: "123 Main St, Austin, TX 78701"
  const parts = item.display_name.split(', ');

  // If we have address details, build from those
  if (item.address) {
    const city = item.address.city || '';
    const state = item.address.state || '';
    const zip = item.address.postcode || '';
    const stateAbbr = STATE_ABBR[state] || state;

    // Get the street part (everything before the city in display_name)
    const cityIdx = parts.findIndex(p => p === city);
    const streetParts = cityIdx > 0 ? parts.slice(0, cityIdx) : parts.slice(0, 2);
    const street = streetParts.join(', ');

    if (street && city) {
      return `${street}, ${city}${stateAbbr ? ', ' + stateAbbr : ''}${zip ? ' ' + zip : ''}`;
    }
  }

  // Fallback: take first 3-4 meaningful parts
  const filtered = parts.filter(p =>
    p !== 'United States' && p !== 'USA' && !p.includes('County')
  );
  return filtered.slice(0, 4).join(', ');
}

const STATE_ABBR: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};
