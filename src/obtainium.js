export const obtainiumSource = Object.freeze({
  id: 'com.lindseywebsolutions.seconddeck',
  url: 'https://github.com/LindseyWebSolutions/seconddeck',
  author: 'Lindsey Web Solutions',
  name: 'SecondDeck',
  preferredApkIndex: 0,
  additionalSettings: JSON.stringify({
    appName: 'SecondDeck',
    appAuthor: 'Lindsey Web Solutions'
  })
});

export function obtainiumImportUrl() {
  return `obtainium://app/${encodeURIComponent(JSON.stringify(obtainiumSource))}`;
}
