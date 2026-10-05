SiliconSense Studio — local build
=================================

Songs and covers are computed on your own graphics card. Nothing leaves
your computer.

WHAT YOU NEED
• Windows 10 or 11
• An NVIDIA graphics card with 6 GB or more
• NVIDIA driver 580 or newer. Older drivers still work, but everything
  takes about five times longer
• About 25 GB of free disk space
• git: https://git-scm.com/download/win
• An internet connection for the first run, about 7 GB is downloaded

HOW TO START
Double-click start.bat and wait. The first run takes a long time: it
installs Python, the engine, the libraries and the models. After that
startup takes less than a minute. The browser opens by itself.
To shut down, close the black window.

The interface language follows your Windows settings, and the studio
itself has an RU / EN switch in the top right corner.

WHAT IT DOES
• Song from lyrics: you write the style and the words, you get a recording.
• Cover from a recording: you give it your own file, the melody is
  transcribed from it, you correct the notes with the mouse and sing
  your own lyrics to that melody.

MAKING A COVER
1. Pick the file, then next to the transcribe button choose WHAT to
   transcribe:
   - "melody and chords" - the score carries the original harmony and the
     cover follows it. Choose this for a recognisable cover;
   - "melody only" - the model sings your tune and invents its own
     accompaniment.
   Choose BEFORE transcribing; the singing mode follows automatically.
2. Transcribe the score.
3. Write the cover lyrics.
4. Leave style strength off.
5. Sing.

ABOUT THE "FIT THE MELODY TO THE LYRICS" BUTTON
Do NOT press it if you want a cover that follows the original: it CHANGES
the melody, merging surplus notes and splitting long ones to match the
syllable count, and the original stops being recognisable.
It helps in a different case: when you write your own lyrics whose lines
differ a lot in length from the tune, and fitting the words matters more
than keeping the original shape.

HOW LONG IT TAKES
About as long as the song itself. Measured on a laptop RTX 4050 with
6 GB: one minute of music takes 61 seconds, two minutes take 118 seconds.
A cover runs in two stages: first the melody is transcribed from your
recording, about two minutes, then the song is sung from those notes.
A two-minute cover took about four minutes in total. A stronger card
will be faster.

A NOTE ON LENGTH
Songs up to two minutes are tested on 6 GB. The longer the song, the
more memory it needs, and a very long one may not fit. If it reports
not enough video memory, close games and heavy browser tabs, or pick
a shorter song.

IF SOMETHING GOES WRONG
The window stays open on an error and says what happened. Copy the
whole text — the cause is usually visible in it.

Common cases:
• "nvidia-smi was not found" — no NVIDIA driver, or the card is not NVIDIA.
• "git is required" — install it from the link above.
• The download seems stuck and the numbers do not move for many minutes —
  close the window and run start.bat again, it resumes where it stopped.
• Your antivirus complains about the batch file — it downloads an
  installer, which is expected.
• It is many times slower than stated above and the line
  "You need pytorch with cu130" appeared — your NVIDIA driver is old.
  Update it, delete the .venv folder and run start.bat again.
• The card is not detected — run check.bat and send us the whole output.
• "The procedure entry point could not be located ... torchvision" —
  mismatched versions. Delete the .venv folder and run start.bat again:
  the libraries will be reinstalled as a consistent set. The models and
  the engine are not downloaded again.

MODEL LICENCE
The weights are downloaded directly from HuggingFace and are released by
their authors under CC BY-NC 4.0: personal use is free, including earning
money from the tracks you create. Use by a company is arranged with the
authors separately. We neither redistribute nor modify the weights.
YuE2 is a project by Multimodal Art Projection and HKGAI,
https://huggingface.co/m-a-p/YuE2-3B

Cover duration — v1.2.0

The hidden 2:00 cap is removed. “Follow the score” uses the current edited
score and tempo, adding 5 seconds for the ending. A 4:00 score therefore
gets a 4:05 generation budget.

“Set a manual limit” accepts 1–900 seconds. This is a maximum, not a promised
output length: the model may finish earlier. The UI warns when the limit is
shorter than the score. Scores that cannot be timed automatically, or exceed
15 minutes including the ending allowance, require a manual choice or a
shorter score; there is no silent fallback to two minutes.

A result message distinguishes a duration cutoff from exhausted model
context. Raising the duration alone cannot solve the latter: shorten the
lyrics/score or split the song. This build does not automatically join parts.

Only two-minute generations were previously measured on an RTX 4050 6 GB.
Long-cover duration calculations, job construction and UI have automated
coverage; actual 3–6 minute GPU generations were not benchmarked for this
update. A longer score consumes model context and a longer output needs more
memory. The 900-second engine limit does not guarantee a 15-minute song on
every graphics card.

Updating an existing installation

1. Close the studio and its console so the engine stops.
2. Download the archive from the https://github.com/siliconsense/yue2-studio-pc/releases/latest.
3. Copy all contents of the archive's studio folder into your existing studio
   folder, replacing files. Include duration.py and the engine_nodes folder.
4. Keep engine, .venv, tools and songs. No model re-download or PyTorch
   reinstallation is needed for this fix.
5. Run start.bat and refresh the browser. The small generation-report node
   is installed automatically at startup.
