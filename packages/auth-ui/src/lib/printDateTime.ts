export function printDateTime(date: Date, showSeconds: boolean = true): string {
  const year = date.getFullYear();

  const month: string = ("0" + (date.getMonth() + 1)).slice(-2);
  // To make sure the month always has 2-character-format. For example, 1 => 01, 2 => 02

  const date_of_month: string = ("0" + date.getDate()).slice(-2);
  // To make sure the date always has 2-character-format

  const hour: string = ("0" + date.getHours()).slice(-2);
  // To make sure the hour always has 2-character-format

  const minute: string = ("0" + date.getMinutes()).slice(-2);
  // To make sure the minute always has 2-character-format

  const second: string = ("0" + date.getSeconds()).slice(-2);
  // To make sure the second always has 2-character-format

  const dateSubstr: string = `${year}/${month}/${date_of_month}`;
  const timeSubstr: string = showSeconds
    ? `${hour}:${minute}:${second}`
    : `${hour}:${minute}`;

  const datetime_str: string = dateSubstr + " " + timeSubstr;
  return datetime_str;
}

export default printDateTime;
