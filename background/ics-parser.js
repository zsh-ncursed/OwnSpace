// OwnSpace — iCalendar (ICS) parsing helpers.
//
// This is a CLASSIC script (no import/export): it is loaded by the background
// service worker via importScripts('ics-parser.js') and by vitest as a plain
// side-effect import (import '../background/ics-parser.js'). It exposes the
// helpers on globalThis.OwnSpaceICS so both consumers can use them.
(function (global) {
  'use strict';

  function unfoldICS(lines) {
    const unfolded = [];
    for (const raw of lines) {
      const line = raw.replace(/\r$/, '');
      if (line.length > 0 && (line[0] === ' ' || line[0] === '\t')) {
        if (unfolded.length > 0) unfolded[unfolded.length - 1] += line.slice(1);
      } else {
        unfolded.push(line);
      }
    }
    return unfolded;
  }

  function parseICSProps(componentBlock) {
    const props = {};
    for (const line of componentBlock) {
      const colonIdx = line.indexOf(':');
      if (colonIdx < 1) continue;
      const propName = line.slice(0, colonIdx);
      const propValue = line.slice(colonIdx + 1);
      props[propName] = propValue;
    }
    return props;
  }

  function splitICSComponents(unfoldedLines) {
    const components = [];
    let current = null;
    for (const line of unfoldedLines) {
      if (line === 'BEGIN:VEVENT') {
        current = [];
      } else if (line === 'END:VEVENT' && current !== null) {
        components.push(current);
        current = null;
      } else if (current !== null) {
        current.push(line);
      }
    }
    return components;
  }

  function icsDateToAppFormat(raw) {
    // raw examples:
    //   "20240101"           (all-day DATE)
    //   "20240101T120000"    (local datetime)
    //   "20240101T120000Z"   (UTC datetime)
    //   "20240101T120000+0300" / "20240101T120000-0500" (numeric UTC offset)

    // Strip a trailing UTC marker (Z) OR numeric UTC offset (+HHMM / -HHMM)
    // FIRST. The old code stripped only "Z" and checked lengths before the
    // offset regex, so "20240101T120000+0300" (19 chars) fell through to the
    // 1970-01-01 fallback. Offsets are intentionally ignored (treated as local
    // time) — OwnSpace stores naive local datetimes.
    const dateStr = raw.replace(/(?:Z|[+-]\d{4})$/, '');
    if (dateStr.length === 8) {
      // All-day: YYYYMMDD
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      return { date: `${year}-${month}-${day}` };
    }
    if (dateStr.length === 15) {
      // Datetime: YYYYMMDDTHHMMSS
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      const hour = dateStr.slice(9, 11);
      const min = dateStr.slice(11, 13);
      return { date: `${year}-${month}-${day}`, time: `${hour}:${min}` };
    }
    return { date: '1970-01-01' };
  }

  function parseCalDAVEvents(icsData) {
    const unfolded = unfoldICS(icsData.split('\n'));
    const vevents = splitICSComponents(unfolded);
    const events = [];

    for (const block of vevents) {
      const props = parseICSProps(block);
      const uid = props.UID || '';
      const summary = props.SUMMARY || 'Без названия';

      // Find DTSTART and DTEND (might have params like "DTSTART;VALUE=DATE")
      let dtstartRaw = '';
      let dtendRaw = '';
      let isAllDay = false;
      for (const key of Object.keys(props)) {
        const base = key.split(';')[0];
        if (base === 'DTSTART') {
          dtstartRaw = props[key];
          if (key.includes('VALUE=DATE')) isAllDay = true;
        }
        if (base === 'DTEND') {
          dtendRaw = props[key];
        }
      }

      if (!dtstartRaw) continue; // invalid event

      const start = icsDateToAppFormat(dtstartRaw);
      const end = dtendRaw ? icsDateToAppFormat(dtendRaw) : start;

      events.push({
        uid,
        title: summary,
        date: start.date,
        time: isAllDay ? undefined : start.time || '00:00',
        endDate: end.date,
        isAllDay,
        source: 'caldav',
      });
    }

    return events;
  }

  global.OwnSpaceICS = {
    unfoldICS,
    parseICSProps,
    splitICSComponents,
    icsDateToAppFormat,
    parseCalDAVEvents,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
