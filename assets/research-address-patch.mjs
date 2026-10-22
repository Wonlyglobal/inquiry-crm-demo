// A research save is not an address verification event. Omit untouched fields
// entirely so it also cannot overwrite newer address data from another editor.
export function researchAddressPatch(before, values) {
  const clean = value => String(value || '').trim() || null;
  const fields = ['map_address', 'google_maps_url', 'openstreetmap_url'];
  const next = Object.fromEntries(fields.map(key => [key, clean(values[key])]));
  if (fields.every(key => clean(before?.[key]) === next[key])) return {};
  return {
    ...next,
    map_provider: next.map_address ? clean(values.map_provider) : null,
    map_place_id: next.map_address ? clean(values.map_place_id) : null,
    // Even an accepted geocoder candidate is not independently verified.
    map_verified_at: null,
  };
}
