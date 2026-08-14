#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
asset_dir="$repo_dir/web/assets"

source_dir="${1:-${BLOOD_STEAM_DIR:-}}"
if [[ -z "$source_dir" ]]; then
    steam_candidates=(
        "$HOME/.steam/debian-installation/steamapps/common/One Unit Whole Blood"
        "$HOME/.steam/steam/steamapps/common/One Unit Whole Blood"
        "$HOME/.local/share/Steam/steamapps/common/One Unit Whole Blood"
    )
    for candidate in "${steam_candidates[@]}"; do
        if [[ -f "$candidate/BLOOD.RFF" ]]; then
            source_dir="$candidate"
            break
        fi
    done
    source_dir="${source_dir:-${steam_candidates[0]}}"
fi

required_files=(
    BLOOD.INI
    BLOOD.RFF
    GUI.RFF
    SOUNDS.RFF
    SURFACE.DAT
    VOXEL.DAT
)

optional_files=(
    BLOOD000.DEM
    BLOOD001.DEM
    BLOOD002.DEM
    BLOOD003.DEM
    CP01.MAP
    CP02.MAP
    CP03.MAP
    CP04.MAP
    CP05.MAP
    CP06.MAP
    CP07.MAP
    CP08.MAP
    CP09.MAP
    CPART07.AR_
    CPART15.AR_
    CPBB01.MAP
    CPBB02.MAP
    CPBB03.MAP
    CPBB04.MAP
    CPSL.MAP
    CRYPTIC.INI
    CRYPTIC.SMK
    CRYPTIC.WAV
    GTI.SMK
    LOGO.SMK
    blood02.ogg
    blood03.ogg
    blood04.ogg
    blood05.ogg
    blood06.ogg
    blood07.ogg
    blood08.ogg
    blood09.ogg
)

for tile_number in {000..017}; do
    required_files+=("TILES${tile_number}.ART")
done

missing=0
for file in "${required_files[@]}"; do
    if [[ ! -f "$source_dir/$file" ]]; then
        printf 'Missing required Blood file: %s\n' "$source_dir/$file" >&2
        missing=1
    fi
done

if (( missing != 0 )); then
    printf 'Pass the Blood installation directory as the first argument or set BLOOD_STEAM_DIR.\n' >&2
    exit 1
fi

mkdir -p "$asset_dir"
for file in "${required_files[@]}"; do
    cp -f "$source_dir/$file" "$asset_dir/$file"
done

optional_count=0
for file in "${optional_files[@]}"; do
    if [[ -f "$source_dir/$file" ]]; then
        cp -f "$source_dir/$file" "$asset_dir/$file"
        (( optional_count += 1 ))
    fi
done

movie_count=0
movie_source=""
for candidate in "$source_dir/movie" "$source_dir/MOVIE"; do
    if [[ -d "$candidate" ]]; then
        movie_source="$candidate"
        break
    fi
done
if [[ -n "$movie_source" ]]; then
    mkdir -p "$asset_dir/movie"
    cp -a "$movie_source/." "$asset_dir/movie/"
    movie_count="$(find "$movie_source" -type f | wc -l)"
fi

printf '[NBlood WASM] Staged %d required game files in %s\n' "${#required_files[@]}" "$asset_dir"
printf '[NBlood WASM] Staged %d optional demo, Cryptic Passage, cutscene, and music files\n' "$optional_count"
printf '[NBlood WASM] Staged %d optional movie-directory files\n' "$movie_count"
printf '[NBlood WASM] These proprietary files are ignored by git and must not be redistributed.\n'
