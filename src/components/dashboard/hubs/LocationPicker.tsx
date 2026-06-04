"use client";

import { useEffect, useRef, useState } from "react";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// Default map center when no coordinates yet (Manila, Philippines).
const DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 };

export function LocationPicker({
  defaultAddress = "",
  defaultLat = null,
  defaultLng = null,
}: {
  defaultAddress?: string;
  defaultLat?: number | null;
  defaultLng?: number | null;
}) {
  const [address, setAddress] = useState(defaultAddress);
  const [lat, setLat] = useState<number | null>(defaultLat);
  const [lng, setLng] = useState<number | null>(defaultLng);
  const [loadError, setLoadError] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!KEY || !inputRef.current || !mapRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        // Lazy-import on the client only — the loader touches `window`.
        const { setOptions, importLibrary } = await import(
          "@googlemaps/js-api-loader"
        );
        setOptions({ key: KEY, v: "weekly" });
        const [{ Map }, { Marker }, { Autocomplete }, { Geocoder }] =
          await Promise.all([
            importLibrary("maps"),
            importLibrary("marker"),
            importLibrary("places"),
            importLibrary("geocoding"),
          ]);
        if (cancelled || !mapRef.current || !inputRef.current) return;

        const hasCoords = defaultLat != null && defaultLng != null;
        const center = hasCoords
          ? { lat: defaultLat as number, lng: defaultLng as number }
          : DEFAULT_CENTER;

        const map = new Map(mapRef.current, {
          center,
          zoom: hasCoords ? 16 : 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        const marker = new Marker({
          map,
          position: center,
          draggable: true,
          visible: hasCoords,
        });
        const geocoder = new Geocoder();

        const setPoint = (p: google.maps.LatLngLiteral) => {
          setLat(p.lat);
          setLng(p.lng);
          marker.setPosition(p);
          marker.setVisible(true);
          map.setCenter(p);
        };

        // Type-ahead address search.
        const autocomplete = new Autocomplete(inputRef.current, {
          fields: ["formatted_address", "geometry"],
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const loc = place.geometry?.location;
          if (!loc) return;
          map.setZoom(16);
          setPoint({ lat: loc.lat(), lng: loc.lng() });
          const formatted = place.formatted_address ?? inputRef.current!.value;
          setAddress(formatted);
          if (inputRef.current) inputRef.current.value = formatted;
        });

        // Drag the pin → reverse-geocode to an address.
        marker.addListener("dragend", () => {
          const pos = marker.getPosition();
          if (!pos) return;
          const p = { lat: pos.lat(), lng: pos.lng() };
          setLat(p.lat);
          setLng(p.lng);
          geocoder.geocode({ location: p }, (results, status) => {
            if (status === "OK" && results?.[0]) {
              const formatted = results[0].formatted_address;
              setAddress(formatted);
              if (inputRef.current) inputRef.current.value = formatted;
            }
          });
        });

        // Click the map to drop/move the pin.
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          setPoint({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        });
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Initialize once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="hub-address"
        className="text-sm font-medium text-gray-800"
      >
        Location / Address
      </label>
      <input
        id="hub-address"
        ref={inputRef}
        defaultValue={defaultAddress}
        onChange={(e) => setAddress(e.target.value)}
        placeholder={
          KEY ? "Search for an address…" : "e.g. 12 River St, Manila"
        }
        autoComplete="off"
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />

      {KEY && (
        <>
          <div
            ref={mapRef}
            className="mt-2 h-64 w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
          />
          <p className="text-xs text-gray-400">
            Search above, or click the map / drag the pin to set the exact spot.
          </p>
        </>
      )}
      {!KEY && (
        <p className="text-xs text-gray-400">
          Add a Google Maps API key to enable search and map pinning.
        </p>
      )}
      {loadError && (
        <p className="text-xs text-amber-600">
          Map couldn&apos;t load — you can still type the address.
        </p>
      )}

      <input type="hidden" name="address" value={address} />
      <input type="hidden" name="latitude" value={lat ?? ""} />
      <input type="hidden" name="longitude" value={lng ?? ""} />
    </div>
  );
}
