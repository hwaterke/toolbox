# Exiftool Cheat Sheet

## Common

See all time information of a file

```shell
exiftool -Time:All -G0:1 video.mp4
```

## Photo

Set time zone to a photo

```shell
exiftool -overwrite_original -P -EXIF:OffsetTime="+02:00" -EXIF:OffsetTimeOriginal="+02:00" -EXIF:OffsetTimeDigitized="+02:00" FILE.JPG
```

## Video

Add a time zone tag to an existing video

```shell
exiftool -overwrite_original -P -api QuickTimeUTC -CreationDate="2022:06:06 17:00:00+02:00" FILE.MP4
```

Set all time info to a given time WITH time zone (will set correct UTC time for
QuickTime)

```shell
exiftool -overwrite_original -api QuickTimeUTC -wm w -time:all="2022:06:06 17:00:00+02:00" -FileCreateDate= FILE.MP4
```

Rotate a video

```shell
exiftool -overwrite_original -P -Rotation=90 FILE.MP4
```
