# SPDX-License-Identifier: LicenseRef-AGPL-3.0-only-OpenSSL
# Adapted from Pylux's android/app/CMakeLists.txt (same JNI bridge sources,
# just relocated under android/chiaki/jni/ within XStreaming's tree).
cmake_minimum_required(VERSION 3.13)

add_library(chiaki-jni SHARED
		chiaki-jni.c
		log.h
		log.c
		video-decoder.h
		video-decoder.c
		audio-decoder.h
		audio-decoder.c
		opus-decoder.h
		opus-decoder.c
		audio-output.h
		audio-output.cpp
		circular-fifo.hpp)

target_link_options(chiaki-jni PRIVATE "-Wl,-z,max-page-size=16384")

target_link_libraries(chiaki-jni chiaki-lib)

find_library(ANDROID_LIB_LOG log)
find_library(ANDROID_LIB_MEDIANDK mediandk)
find_library(ANDROID_LIB_ANDROID android)
target_link_libraries(chiaki-jni "${ANDROID_LIB_LOG}" "${ANDROID_LIB_MEDIANDK}" "${ANDROID_LIB_ANDROID}")

add_subdirectory(oboe)
target_link_libraries(chiaki-jni oboe)
