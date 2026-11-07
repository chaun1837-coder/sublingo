# Third-party software notice

SubLingo invokes the FFmpeg executable available on the host system (by default, `ffmpeg` on PATH; set `FFMPEG_PATH` to use another binary). Render Native Runtimes provide FFmpeg as a system utility. Local environments must install FFmpeg separately.

SubLingo no longer bundles an FFmpeg binary through the `ffmpeg-static` npm package. The FFmpeg binary supplied by the host remains subject to its own copyright and license terms; consult the distribution or vendor that provided it. This notice is informational and is not legal advice.
