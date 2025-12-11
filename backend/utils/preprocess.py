# backend/utils/preprocess.py
import pandas as pd
import numpy as np

def infer_dtypes(df: pd.DataFrame):
    """Return a user-friendly schema dict: column -> type string (number, string, date, bool)."""
    schema = {}
    for col in df.columns:
        series = df[col]
        if pd.api.types.is_datetime64_any_dtype(series):
            schema[col] = "date"
        elif pd.api.types.is_bool_dtype(series):
            schema[col] = "boolean"
        elif pd.api.types.is_numeric_dtype(series):
            schema[col] = "number"
        elif pd.api.types.is_categorical_dtype(series) or series.nunique() < 50:
            schema[col] = "categorical"
        else:
            schema[col] = "string"
    return schema


def handle_missing_values(df: pd.DataFrame, drop_thresh=0.5):
    """
    - drop columns with > drop_thresh fraction missing
    - numeric: fill with median
    - categorical/string: fill with 'Unknown'
    """
    n_rows = len(df)
    to_drop = []
    for col in df.columns:
        miss_frac = df[col].isnull().mean()
        if miss_frac > drop_thresh:
            to_drop.append(col)
    if to_drop:
        df = df.drop(columns=to_drop)

    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            median = df[col].median()
            df[col] = df[col].fillna(median)
        else:
            df[col] = df[col].fillna("Unknown")
    return df


def remove_duplicates(df: pd.DataFrame):
    return df.drop_duplicates().reset_index(drop=True)


def handle_outliers_iqr(df: pd.DataFrame, numeric_clip=True):
    """
    Use IQR method: keep rows within [Q1 - 1.5*IQR, Q3 + 1.5*IQR]
    If numeric_clip is True, clip numeric columns instead of dropping rows.
    """
    num_cols = df.select_dtypes(include=np.number).columns
    if numeric_clip:
        for col in num_cols:
            q1 = df[col].quantile(0.25)
            q3 = df[col].quantile(0.75)
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            df[col] = df[col].clip(lower=lower, upper=upper)
    else:
        mask = pd.Series(True, index=df.index)
        for col in num_cols:
            q1 = df[col].quantile(0.25)
            q3 = df[col].quantile(0.75)
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            mask &= df[col].between(lower, upper)
        df = df[mask].reset_index(drop=True)
    return df


def basic_summary_stats(df: pd.DataFrame):
    """
    Return small summary: row_count, column_count, per-column type, missing counts, basic describe for numbers.
    """
    stats = {
        "rows": len(df),
        "columns": len(df.columns),
        "missing_per_column": df.isnull().sum().to_dict(),
    }
    numeric = df.select_dtypes(include=np.number)
    if not numeric.empty:
        stats["numeric_summary"] = numeric.describe().to_dict()
    else:
        stats["numeric_summary"] = {}
    return stats


def clean_dataset(df: pd.DataFrame, drop_thresh=0.5, clip_outliers=True):
    """
    Full preprocessing pipeline:
      1. reset index
      2. drop duplicates
      3. infer datetimes for columns that look like dates
      4. handle missing values
      5. outlier handling (clip by default)
      6. infer schema & summary stats
    Returns (cleaned_df, schema_dict, stats_dict)
    """
    df = df.copy()
    df = df.reset_index(drop=True)

    # Try to convert object columns that look like dates
    for col in df.select_dtypes(include=["object"]).columns:
        try:
            parsed = pd.to_datetime(df[col], errors="coerce", infer_datetime_format=True)
            # if many parsed values not null, keep conversion
            if parsed.notnull().sum() / max(1, len(parsed)) > 0.6:
                df[col] = parsed
        except Exception:
            pass

    df = remove_duplicates(df)
    df = handle_missing_values(df, drop_thresh=drop_thresh)
    df = handle_outliers_iqr(df, numeric_clip=clip_outliers)

    schema = infer_dtypes(df)
    stats = basic_summary_stats(df)

    return df, schema, stats
