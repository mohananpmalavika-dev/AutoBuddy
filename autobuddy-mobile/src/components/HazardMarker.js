import React from 'react';
import L from 'leaflet';

export function createHazardIcon(color) {
  return L.divIcon({
    html: `<div style="width:18px;height:18px;display:flex;align-items:center;justify-content:center"><div style=\"width:14px;height:14px;border-radius:999px;background:${color};box-shadow:0 0 0 rgba(0,0,0,0.12);border:2px solid rgba(255,255,255,0.9);\" class=\"pulse\"></div></div>`,
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function HazardMarker() {
  return null;
}
