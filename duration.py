"""Duration of the linear ABC dialect produced by SheetSage2 / our piano roll.

No GPU, engine or third-party dependencies. Unsupported timing syntax fails
explicitly: callers can choose a manual budget instead of silently truncating.
"""
import math
import re
from fractions import Fraction

MAX_SECONDS = 900
TAIL_SECONDS = 5


class DurationError(ValueError):
    pass


def score_seconds(abc):
    if not isinstance(abc, str) or len(abc) > 1_000_000:
        raise DurationError('score_duration')
    headers, body, started = {}, [], False
    for raw in abc.replace('\r', '').splitlines():
        line = raw.split('%', 1)[0].strip()
        if not line:
            continue
        m = re.match(r'^([A-Za-z]):\s*(.*)$', line)
        if not started:
            if m:
                headers.setdefault(m[1], []).append(m[2])
                if m[1] == 'K':
                    started = True
            continue
        body.append(line)
    if not started:
        raise DurationError('score_duration')
    try:
        unit = Fraction(headers.get('L', ['1/8'])[-1])
        meter_text = headers.get('M', ['4/4'])[-1]
        meter = Fraction({'C': '4/4', 'C|': '2/2'}.get(meter_text, meter_text))
        q = re.sub(r'"[^"]*"', '', headers.get('Q', ['1/4=90'])[-1]).strip()
        tempo = re.fullmatch(r'(?:(\d+/\d+)\s*=\s*)?(\d+(?:\.\d+)?)', q)
        if not tempo:
            raise ValueError()
        beat = Fraction(tempo[1] or '1/4')
        bpm = float(tempo[2])
        if min(unit, meter, beat) <= 0 or not math.isfinite(bpm) or bpm <= 0:
            raise ValueError()
    except (ValueError, ZeroDivisionError, OverflowError):
        raise DurationError('score_duration') from None
    voices = [v.split()[0] for v in headers.get('V', []) if v.split()]
    current = voices[0] if voices else 'V1'
    cursors = {current: Fraction(0)}
    events = 0
    note = re.compile(r"(?:[_=^]*[A-Ga-g][,']*|[zxZ])(\d*)(/{1,}\d*)?-?")
    for line in body:
        if line.startswith('V:'):
            current = line[2:].strip().split()[0]
            cursors.setdefault(current, Fraction(0))
            continue
        if re.match(r'^[A-Za-z]:', line):
            if line.startswith(('w:', 'W:', 'K:')):
                continue
            raise DurationError('score_duration')
        # Chords and decorations do not consume time. Repeats/tuplets/inline
        # tempo changes need a richer interpreter; never underestimate them.
        line = re.sub(r'"[^"]*"|![^!]*!|\+[^+]*\+', '', line)
        i = 0
        while i < len(line):
            ch = line[i]
            if ch.isspace() or ch in '-().~':
                if ch == '(' and i + 1 < len(line) and line[i+1].isdigit():
                    raise DurationError('score_duration')
                i += 1
                continue
            if ch in '|[]':
                if ch == '[' and i + 1 < len(line) and line[i+1] not in '|]':
                    raise DurationError('score_duration')
                cursors[current] = math.ceil(cursors[current] / meter) * meter
                i += 1
                continue
            m = note.match(line, i)
            if not m:
                raise DurationError('score_duration')
            multiplier = Fraction(int(m[1] or 1))
            slash = m[2]
            if slash:
                denominator = slash.lstrip('/')
                if denominator:
                    if len(slash) - len(denominator) != 1 or int(denominator) == 0:
                        raise DurationError('score_duration')
                    multiplier /= int(denominator)
                else:
                    multiplier /= 2 ** len(slash)
            cursors[current] += (meter if ch == 'Z' else unit) * multiplier
            events += 1
            i = m.end()
    if not events:
        raise DurationError('score_duration')
    seconds = float(max(cursors.values()) / beat) * 60 / bpm
    if not math.isfinite(seconds) or seconds <= 0:
        raise DurationError('score_duration')
    return seconds


def generation_seconds(abc, value=None):
    """Missing cover duration means auto, never a hidden 120-second cap."""
    if value is None or value == 'auto':
        if not abc.strip():
            return 120.0
        result = math.ceil(score_seconds(abc)) + TAIL_SECONDS
        if result > MAX_SECONDS:
            raise DurationError('score_too_long')
        return float(result)
    try:
        if isinstance(value, bool):
            raise ValueError()
        seconds = float(value)
    except (ValueError, TypeError, OverflowError):
        raise DurationError('bad_duration') from None
    if not math.isfinite(seconds) or not 0.04 <= seconds <= MAX_SECONDS:
        raise DurationError('bad_duration')
    return seconds
