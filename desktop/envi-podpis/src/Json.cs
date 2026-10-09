using System;
using System.Collections;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace EnviPodpis
{
    internal static class Json
    {
        public static string Serialize(object value)
        {
            JavaScriptSerializer s = new JavaScriptSerializer();
            s.MaxJsonLength = int.MaxValue;
            return s.Serialize(value);
        }

        public static object Parse(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            JavaScriptSerializer s = new JavaScriptSerializer();
            s.MaxJsonLength = int.MaxValue;
            return s.DeserializeObject(text);
        }

        public static IDictionary<string, object> AsObject(object o)
        {
            return o as IDictionary<string, object>;
        }

        public static string GetString(object o, string key)
        {
            IDictionary<string, object> d = AsObject(o);
            object v;
            if (d == null || !d.TryGetValue(key, out v) || v == null) return null;
            return Convert.ToString(v);
        }

        public static int GetInt(object o, string key, int fallback)
        {
            IDictionary<string, object> d = AsObject(o);
            object v;
            if (d == null || !d.TryGetValue(key, out v) || v == null) return fallback;
            try { return Convert.ToInt32(v); } catch (Exception) { return fallback; }
        }

        public static List<object> GetList(object o, string key)
        {
            List<object> result = new List<object>();
            IDictionary<string, object> d = AsObject(o);
            object v;
            if (d == null || !d.TryGetValue(key, out v) || v == null) return result;
            IEnumerable e = v as IEnumerable;
            if (e == null || v is string) return result;
            foreach (object item in e) result.Add(item);
            return result;
        }
    }
}
