# SPDX-License-Identifier: LicenseRef-AGPL-3.0-only-OpenSSL
#
# Purpose-built root CMakeLists.txt for XStreaming's vendored subset of
# chiaki-ng / Pylux (https://github.com/ForWard-Technologies-LLC/Pylux,
# itself forked from https://github.com/streetpea/chiaki-ng). Both are
# AGPL-3.0 (OpenSSL exception) -- see /COPYING at the repo root.
#
# Unlike Pylux's own root CMakeLists.txt (a full multi-platform project with
# a Qt GUI, CLI, Nintendo Switch/Borealis, Steam Deck native and Steamworks
# targets), this file only ever builds the one configuration XStreaming
# actually needs: chiaki-lib plus its Android JNI bridge, scoped to the PS
# Plus cloud-streaming path (no console pairing/regist/discovery/holepunch
# UI here -- that native code still compiles in as part of chiaki-lib since
# splitting it out isn't worth the vendoring risk, it's just never called
# from XStreaming's Kotlin/JS side).
cmake_minimum_required(VERSION 3.13)
project(xstreaming-chiaki C CXX)

if(NOT ANDROID)
	message(FATAL_ERROR "android/chiaki/CMakeLists.txt is Android-only (see ios/ for a future iOS port).")
endif()

# NDK r28+ aligns ELF LOAD segments to 16 KB automatically; add the flag
# explicitly too since XStreaming currently pins an older NDK (23) for its
# other native modules -- harmless no-op once the NDK does this itself.
string(REGEX MATCH "max-page-size" _xst_has_max_page_size "${CMAKE_SHARED_LINKER_FLAGS}")
if(NOT _xst_has_max_page_size)
	set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} -Wl,-z,max-page-size=16384")
endif()
unset(_xst_has_max_page_size)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

set(CMAKE_C_STANDARD 99)
set(CMAKE_CXX_STANDARD 14)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Pylux suppresses -Wdocumentation/-Wunused-but-set-variable here for NDK
# r28+, whose newer Clang both recognizes and errors on them in some vendored
# third-party sources (mbedTLS in particular). XStreaming currently pins NDK
# 23 (matching its other native modules), whose older Clang doesn't have
# either warning to begin with -- passing the suppression flags anyway would
# itself be a hard error (`unknown warning option`), so this is intentionally
# left out rather than ported verbatim. Revisit if XStreaming's ndkVersion is
# ever bumped to r28+.

# ---------------------------------------------------------------------------
# chiaki-lib's own build options -- pinned to exactly what Pylux's Android
# Gradle config passes (see its android/app/build.gradle), just hardcoded
# here instead of exposed as toggles, since this file only ever builds one
# configuration.
# ---------------------------------------------------------------------------
set(CHIAKI_ENABLE_TESTS OFF)
set(CHIAKI_LIB_ENABLE_OPUS ON)
set(CHIAKI_LIB_ENABLE_MBEDTLS ON)
set(CHIAKI_LIB_MBEDTLS_EXTERNAL_PROJECT ON)
# The CMake variable above only controls which crypto lib gets *linked*
# (see lib/CMakeLists.txt); several lib/src/*.c files (rpcrypt.c, ecdh.c, ...)
# #ifdef on this preprocessor define to pick mbedTLS's vs. OpenSSL's headers,
# so both need to be set together.
add_definitions(-DCHIAKI_LIB_ENABLE_MBEDTLS)
set(CHIAKI_ENABLE_FFMPEG_DECODER OFF)
set(CHIAKI_LIB_ENABLE_PI_DECODER OFF)
set(CHIAKI_USE_SYSTEM_JERASURE OFF)
set(CHIAKI_USE_SYSTEM_NANOPB OFF)
set(CHIAKI_USE_SYSTEM_CURL OFF)
# Matches Pylux's own Gradle cmake arguments exactly -- without these,
# curl's bundled CMakeLists.txt also builds its test suite and CLI tool,
# which duplicate ninja build rules for this NDK/CMake/ninja combination.
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
set(BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)

find_package(PythonInterp 3 REQUIRED)

# mbedTLS must be fetched before third-party so curl can build against it.
set(FETCHCONTENT_QUIET OFF)
include(FetchContent)
set(ENABLE_TESTING OFF CACHE BOOL "" FORCE)
set(ENABLE_PROGRAMS OFF CACHE BOOL "" FORCE)
set(USE_SHARED_MBEDTLS_LIBRARY OFF CACHE BOOL "" FORCE)
set(MBEDTLS_PSA_CRYPTO_C OFF CACHE BOOL "Disable PSA Crypto API" FORCE)
FetchContent_Declare(
	mbedtls
	GIT_REPOSITORY https://github.com/Mbed-TLS/mbedtls.git
	GIT_TAG 8b3f26a5ac38d4fdccbc5c5366229f3e01dafcc0 # v2.28.0, matches Pylux's pin
	GIT_PROGRESS TRUE
)
FetchContent_GetProperties(mbedtls)
if(NOT mbedtls_POPULATED)
	FetchContent_Populate(mbedtls)
	# See the NDK 23 vs. r28+ note near the top of this file -- no warning
	# suppression flags needed here for the same reason.
	add_subdirectory(${mbedtls_SOURCE_DIR} ${mbedtls_BINARY_DIR})
endif()

add_subdirectory(third-party)
add_subdirectory(lib)
add_subdirectory(jni)
