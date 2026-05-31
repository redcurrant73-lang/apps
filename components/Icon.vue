<script setup lang="ts">
/**
 * Google Material Symbols のフォントベース・アイコン。
 * 使い方:
 *   <Icon name="settings" />
 *   <Icon name="arrow_back" size="20" />
 *   <Icon name="favorite" filled />
 *
 * フォント本体は nuxt.config.ts で読み込んでいる。
 * 利用可能なアイコン名: https://fonts.google.com/icons
 */
const props = withDefaults(
  defineProps<{
    name: string
    size?: string | number
    filled?: boolean
  }>(),
  { size: 24, filled: false },
)

const style = computed(() => ({
  fontSize: (typeof props.size === 'number' ? props.size : parseInt(props.size, 10) || 24) + 'px',
  fontVariationSettings: props.filled
    ? `'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24`
    : `'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
}))
</script>

<template>
  <span class="material-symbols-rounded inline-flex select-none items-center justify-center leading-none align-middle" :style="style">{{ name }}</span>
</template>

<style>
/* Material Symbols Rounded 共通スタイル */
.material-symbols-rounded {
  font-family: 'Material Symbols Rounded';
  font-weight: normal;
  font-style: normal;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
}
</style>
