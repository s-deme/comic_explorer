# Build the bundled AVIF decoder without a separate assembler dependency.
# ponytail: portable C path; enable assembler optimizations if measured AVIF latency requires it.
set(AOM_TARGET_CPU "generic" CACHE STRING "Portable AVIF decoder target" FORCE)
