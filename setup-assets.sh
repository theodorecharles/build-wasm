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

printf '[NBlood WASM] Staged %d required game files in %s\n' "${#required_files[@]}" "$asset_dir"
printf '[NBlood WASM] These proprietary files are ignored by git and must not be redistributed.\n'
