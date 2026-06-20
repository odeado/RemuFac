using System;
using System.IO;
using System.Net;
using System.Text;
using System.Data.OleDb;
using System.Collections.Generic;
using System.Globalization;

namespace LocalServer
{
    class Program
    {
        private static string BasePath = @"c:\Contabilidad";
        private static string RemuPath = @"c:\Contabilidad\REMUNERACIONES";
        private static string Port = "5000";

        static void Main(string[] args)
        {
            if (args.Length > 0)
            {
                Port = args[0];
            }

            HttpListener listener = new HttpListener();
            listener.Prefixes.Add(string.Format("http://localhost:{0}/", Port));
            listener.Prefixes.Add(string.Format("http://127.0.0.1:{0}/", Port));

            try
            {
                listener.Start();
                Console.WriteLine("==================================================");
                Console.WriteLine(" Servidor API de Contabilidad & Remuneraciones Local");
                Console.WriteLine("==================================================");
                Console.WriteLine(string.Format("Escuchando en http://localhost:{0}/", Port));
                Console.WriteLine("Presiona Ctrl+C para detener el servidor.");
                Console.WriteLine("==================================================");
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error al iniciar el servidor HTTP: " + ex.Message);
                return;
            }

            while (true)
            {
                try
                {
                    HttpListenerContext context = listener.GetContext();
                    ProcessRequest(context);
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Error procesando solicitud: " + ex.Message);
                }
            }
        }

        private static void ProcessRequest(HttpListenerContext context)
        {
            HttpListenerRequest request = context.Request;
            HttpListenerResponse response = context.Response;

            // Enable CORS
            response.Headers.Add("Access-Control-Allow-Origin", "*");
            response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");

            if (request.HttpMethod == "OPTIONS")
            {
                response.StatusCode = (int)HttpStatusCode.OK;
                response.Close();
                return;
            }

            string rawUrl = request.RawUrl;
            Console.WriteLine(string.Format("[{0}] {1} {2}", DateTime.Now.ToString("HH:mm:ss"), request.HttpMethod, rawUrl));

            try
            {
                if (rawUrl.StartsWith("/api/"))
                {
                    HandleApi(context);
                }
                else
                {
                    HandleStaticFile(context);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error en Handler: " + ex.Message);
                SendError(response, ex.Message);
            }
        }

        private static void HandleStaticFile(HttpListenerContext context)
        {
            HttpListenerRequest request = context.Request;
            HttpListenerResponse response = context.Response;

            string urlPath = request.Url.AbsolutePath;
            if (urlPath == "/")
            {
                urlPath = "/index.html";
            }

            string cleanUrlPath = urlPath.Replace("/", Path.DirectorySeparatorChar.ToString()).TrimStart(Path.DirectorySeparatorChar);
            string filePath = Path.Combine(Path.Combine(BasePath, "LocalServer"), cleanUrlPath);

            if (File.Exists(filePath))
            {
                try
                {
                    byte[] buffer = File.ReadAllBytes(filePath);
                    string ext = Path.GetExtension(filePath).ToLower();
                    string contentType = "text/plain";
                    if (ext == ".html" || ext == ".htm") contentType = "text/html; charset=utf-8";
                    else if (ext == ".css") contentType = "text/css; charset=utf-8";
                    else if (ext == ".js") contentType = "application/javascript; charset=utf-8";
                    else if (ext == ".png") contentType = "image/png";
                    else if (ext == ".jpg" || ext == ".jpeg") contentType = "image/jpeg";
                    else if (ext == ".ico") contentType = "image/x-icon";
                    else if (ext == ".json") contentType = "application/json; charset=utf-8";

                    response.ContentType = contentType;
                    response.ContentLength64 = buffer.Length;
                    response.OutputStream.Write(buffer, 0, buffer.Length);
                    response.Close();
                }
                catch (Exception ex)
                {
                    SendError(response, "Error al leer archivo estatico: " + ex.Message);
                }
            }
            else
            {
                response.StatusCode = (int)HttpStatusCode.NotFound;
                byte[] buffer = Encoding.UTF8.GetBytes("Archivo no encontrado localmente.");
                response.ContentType = "text/plain; charset=utf-8";
                response.ContentLength64 = buffer.Length;
                response.OutputStream.Write(buffer, 0, buffer.Length);
                response.Close();
            }
        }

        private static void HandleApi(HttpListenerContext context)
        {
            HttpListenerRequest request = context.Request;
            HttpListenerResponse response = context.Response;

            string path = request.Url.AbsolutePath;
            response.ContentType = "application/json; charset=utf-8";

            Dictionary<string, string> postData = null;
            if (request.HttpMethod == "POST")
            {
                postData = ParsePostBody(request);
            }

            if (path == "/api/empresas")
            {
                string empresasFile = Path.Combine(RemuPath, "Empresas.txt");
                if (!File.Exists(empresasFile))
                {
                    SendJson(response, "[]");
                    return;
                }

                string[] dirs = File.ReadAllLines(empresasFile);
                List<string> jsonList = new List<string>();

                foreach (string dir in dirs)
                {
                    string cleanDir = dir.Trim();
                    if (string.IsNullOrEmpty(cleanDir)) continue;

                    string dbPath = Path.Combine(Path.Combine(RemuPath, cleanDir), "Wages.Mdb");
                    if (File.Exists(dbPath))
                    {
                        string connStr = string.Format("Provider=Microsoft.Jet.OLEDB.4.0;Data Source={0}", dbPath);
                        using (OleDbConnection conn = new OleDbConnection(connStr))
                        {
                            try
                            {
                                conn.Open();
                                EnsureEmpresaColumns(conn);
                                using (OleDbCommand cmd = new OleDbCommand("SELECT Empres, RolEmp, Direcc, Comuna, Ciudad, GiroCo, Repres, RolRep, Telefo AS TelEmp, EmailEmp, Mutualidad, Banco, LogoBase64 FROM [Empresa]", conn))
                                using (OleDbDataReader reader = cmd.ExecuteReader())
                                {
                                    if (reader.Read())
                                    {
                                        string empJson = RowToJson(reader);
                                        // Inject directory name
                                        empJson = empJson.TrimEnd('}') + string.Format(",\"DirName\":\"{0}\"", EscapeJson(cleanDir)) + "}";
                                        jsonList.Add(empJson);
                                    }
                                    else
                                    {
                                        jsonList.Add(string.Format("{{\"DirName\":\"{0}\",\"Empres\":\"{0}\",\"Error\":\"No data in Empresa table\"}}", EscapeJson(cleanDir)));
                                    }
                                }
                            }
                            catch (Exception ex)
                            {
                                jsonList.Add(string.Format("{{\"DirName\":\"{0}\",\"Empres\":\"{0}\",\"Error\":\"{1}\"}}", EscapeJson(cleanDir), EscapeJson(ex.Message)));
                            }
                        }
                    }
                }

                SendJson(response, "[" + string.Join(",", jsonList.ToArray()) + "]");
            }
            else if (path == "/api/empresas/add")
            {
                string dirname = GetParam(request, postData, "dirname");
                string empres = GetParam(request, postData, "empres");
                string rolemp = GetParam(request, postData, "rolemp");
                string direcc = GetParam(request, postData, "direcc");
                string comuna = GetParam(request, postData, "comuna");
                string ciudad = GetParam(request, postData, "ciudad");
                string giro = GetParam(request, postData, "giro");
                string repres = GetParam(request, postData, "repres");
                string rolrep = GetParam(request, postData, "rolrep");
                string tel = GetParam(request, postData, "tel");
                string email = GetParam(request, postData, "email");
                string mutualidad = GetParam(request, postData, "mutualidad");
                string banco = GetParam(request, postData, "banco");
                string logo = GetParam(request, postData, "logo");

                if (string.IsNullOrEmpty(dirname) || string.IsNullOrEmpty(empres))
                {
                    SendError(response, "Faltan parametros obligatorios (dirname y/o empres)");
                    return;
                }

                string newDirFull = Path.Combine(RemuPath, dirname);
                if (Directory.Exists(newDirFull))
                {
                    SendError(response, "La carpeta especificada ya existe");
                    return;
                }

                try
                {
                    // Create folder
                    Directory.CreateDirectory(newDirFull);

                    // Copy DB template
                    string templateDb = Path.Combine(RemuPath, "xWages.Mdb");
                    string destDb = Path.Combine(newDirFull, "Wages.Mdb");
                    File.Copy(templateDb, destDb);

                    // Copy Snow DB template if exists
                    string templateSnow = Path.Combine(RemuPath, "Snow.mdb");
                    if (File.Exists(templateSnow))
                    {
                        File.Copy(templateSnow, Path.Combine(newDirFull, "Snow.Mdb"));
                    }

                    // Update Empresa table in the new DB
                    string connStr = string.Format("Provider=Microsoft.Jet.OLEDB.4.0;Data Source={0}", destDb);
                    using (OleDbConnection conn = new OleDbConnection(connStr))
                    {
                        conn.Open();
                        EnsureEmpresaColumns(conn);
                        // Try updating first
                        using (OleDbCommand cmd = new OleDbCommand("UPDATE [Empresa] SET Empres = ?, RolEmp = ?, Direcc = ?, Comuna = ?, Ciudad = ?, GiroCo = ?, Repres = ?, RolRep = ?, Telefo = ?, EmailEmp = ?, Mutualidad = ?, Banco = ?, LogoBase64 = ?", conn))
                        {
                            cmd.Parameters.AddWithValue("Empres", empres ?? "-");
                            cmd.Parameters.AddWithValue("RolEmp", rolemp ?? "00000000-0");
                            cmd.Parameters.AddWithValue("Direcc", direcc ?? "-");
                            cmd.Parameters.AddWithValue("Comuna", comuna ?? "-");
                            cmd.Parameters.AddWithValue("Ciudad", ciudad ?? "-");
                            cmd.Parameters.AddWithValue("GiroCo", giro ?? "-");
                            cmd.Parameters.AddWithValue("Repres", repres ?? "-");
                            cmd.Parameters.AddWithValue("RolRep", rolrep ?? "-");
                            cmd.Parameters.AddWithValue("Telefo", tel ?? "-");
                            cmd.Parameters.AddWithValue("EmailEmp", email ?? "-");
                            cmd.Parameters.AddWithValue("Mutualidad", mutualidad ?? "ISL");
                            cmd.Parameters.AddWithValue("Banco", banco ?? "-");
                            cmd.Parameters.AddWithValue("LogoBase64", logo ?? "");

                            int affected = cmd.ExecuteNonQuery();
                            if (affected == 0)
                            {
                                // If no rows exist, insert one
                                using (OleDbCommand cmdInsert = new OleDbCommand("INSERT INTO [Empresa] (Empres, RolEmp, Direcc, Comuna, Ciudad, GiroCo, Repres, RolRep, Telefo, EmailEmp, Mutualidad, Banco, LogoBase64) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", conn))
                                {
                                    cmdInsert.Parameters.AddWithValue("Empres", empres ?? "-");
                                    cmdInsert.Parameters.AddWithValue("RolEmp", rolemp ?? "00000000-0");
                                    cmdInsert.Parameters.AddWithValue("Direcc", direcc ?? "-");
                                    cmdInsert.Parameters.AddWithValue("Comuna", comuna ?? "-");
                                    cmdInsert.Parameters.AddWithValue("Ciudad", ciudad ?? "-");
                                    cmdInsert.Parameters.AddWithValue("GiroCo", giro ?? "-");
                                    cmdInsert.Parameters.AddWithValue("Repres", repres ?? "-");
                                    cmdInsert.Parameters.AddWithValue("RolRep", rolrep ?? "-");
                                    cmdInsert.Parameters.AddWithValue("Telefo", tel ?? "-");
                                    cmdInsert.Parameters.AddWithValue("EmailEmp", email ?? "-");
                                    cmdInsert.Parameters.AddWithValue("Mutualidad", mutualidad ?? "ISL");
                                    cmdInsert.Parameters.AddWithValue("Banco", banco ?? "-");
                                    cmdInsert.Parameters.AddWithValue("LogoBase64", logo ?? "");
                                    cmdInsert.ExecuteNonQuery();
                                }
                            }
                        }
                    }

                    // Add to Empresas.txt
                    string empresasFile = Path.Combine(RemuPath, "Empresas.txt");
                    File.AppendAllText(empresasFile, Environment.NewLine + dirname);

                    SendJson(response, "{\"success\":true}");
                }
                catch (Exception ex)
                {
                    SendError(response, "Error al crear la empresa: " + ex.Message);
                }
            }
            else if (path == "/api/empresas/update")
            {
                string dirname = GetParam(request, postData, "dirname");
                string empres = GetParam(request, postData, "empres");
                string rolemp = GetParam(request, postData, "rolemp");
                string direcc = GetParam(request, postData, "direcc");
                string comuna = GetParam(request, postData, "comuna");
                string ciudad = GetParam(request, postData, "ciudad");
                string giro = GetParam(request, postData, "giro");
                string repres = GetParam(request, postData, "repres");
                string rolrep = GetParam(request, postData, "rolrep");
                string tel = GetParam(request, postData, "tel");
                string email = GetParam(request, postData, "email");
                string mutualidad = GetParam(request, postData, "mutualidad");
                string banco = GetParam(request, postData, "banco");
                string logo = GetParam(request, postData, "logo");

                if (string.IsNullOrEmpty(dirname))
                {
                    SendError(response, "Falta parametro 'dirname'");
                    return;
                }

                string dbPath = Path.Combine(Path.Combine(RemuPath, dirname), "Wages.Mdb");
                if (!File.Exists(dbPath))
                {
                    SendError(response, "Base de datos de la empresa no encontrada");
                    return;
                }

                try
                {
                    string connStr = string.Format("Provider=Microsoft.Jet.OLEDB.4.0;Data Source={0}", dbPath);
                    using (OleDbConnection conn = new OleDbConnection(connStr))
                    {
                        conn.Open();
                        EnsureEmpresaColumns(conn);
                        using (OleDbCommand cmd = new OleDbCommand("UPDATE [Empresa] SET Empres = ?, RolEmp = ?, Direcc = ?, Comuna = ?, Ciudad = ?, GiroCo = ?, Repres = ?, RolRep = ?, Telefo = ?, EmailEmp = ?, Mutualidad = ?, Banco = ?, LogoBase64 = ?", conn))
                        {
                            cmd.Parameters.AddWithValue("Empres", empres ?? "-");
                            cmd.Parameters.AddWithValue("RolEmp", rolemp ?? "-");
                            cmd.Parameters.AddWithValue("Direcc", direcc ?? "-");
                            cmd.Parameters.AddWithValue("Comuna", comuna ?? "-");
                            cmd.Parameters.AddWithValue("Ciudad", ciudad ?? "-");
                            cmd.Parameters.AddWithValue("GiroCo", giro ?? "-");
                            cmd.Parameters.AddWithValue("Repres", repres ?? "-");
                            cmd.Parameters.AddWithValue("RolRep", rolrep ?? "-");
                            cmd.Parameters.AddWithValue("Telefo", tel ?? "-");
                            cmd.Parameters.AddWithValue("EmailEmp", email ?? "-");
                            cmd.Parameters.AddWithValue("Mutualidad", mutualidad ?? "ISL");
                            cmd.Parameters.AddWithValue("Banco", banco ?? "-");
                            cmd.Parameters.AddWithValue("LogoBase64", logo ?? "");

                            int affected = cmd.ExecuteNonQuery();
                            SendJson(response, string.Format("{{\"success\":true,\"affected\":{0}}}", affected));
                        }
                    }
                }
                catch (Exception ex)
                {
                    SendError(response, "Error al actualizar empresa: " + ex.Message);
                }
            }
            else if (path == "/api/personal")
            {
                string empresa = request.QueryString["empresa"];
                if (string.IsNullOrEmpty(empresa))
                {
                    SendError(response, "Falta parametro 'empresa'");
                    return;
                }

                string dbPath = Path.Combine(Path.Combine(RemuPath, empresa), "Wages.Mdb");
                if (!File.Exists(dbPath))
                {
                    SendError(response, "Base de datos no encontrada para la empresa especificada");
                    return;
                }

                string connStr = string.Format("Provider=Microsoft.Jet.OLEDB.4.0;Data Source={0}", dbPath);
                using (OleDbConnection conn = new OleDbConnection(connStr))
                {
                    conn.Open();
                    using (OleDbCommand cmd = new OleDbCommand("SELECT Ocupac, Depart, Cuenta AS CuentaBanco, Nombre, RolUni, FechaN AS FecNac, SexoPe, Direcc, SBaseM, AFPper, ISAper, Paterno, Materno, Nacionalidad, Finiquito, EMail, FInici AS FecIngre, TipoContra AS TipoContrato, TelFax AS Telefono, Banco, CargaN AS Cargas FROM [Personal] WHERE Finiquito = False OR Finiquito IS NULL", conn))
                    using (OleDbDataReader reader = cmd.ExecuteReader())
                    {
                        string json = ReaderToJsonArray(reader);
                        SendJson(response, json);
                    }
                }
            }
            else if (path == "/api/personal/add")
            {
                string empresa = request.QueryString["empresa"];
                string rut = request.QueryString["rut"];
                string nombre = request.QueryString["nombre"];
                string paterno = request.QueryString["paterno"];
                string materno = request.QueryString["materno"];
                string ocupac = request.QueryString["ocupac"];
                string sbase = request.QueryString["sbase"];
                string afp = request.QueryString["afp"];
                string isa = request.QueryString["isa"];
                string email = request.QueryString["email"];
                string nacionalidad = request.QueryString["nacionalidad"];
                string direcc = request.QueryString["direcc"];
                string sexo = request.QueryString["sexo"];
                string fecnac = request.QueryString["fecnac"];
                string fecingre = request.QueryString["fecingre"];
                string depart = request.QueryString["depart"];
                string tipocontrato = request.QueryString["tipocontrato"];
                string telefono = request.QueryString["telefono"];
                string banco = request.QueryString["banco"];
                string cuentabanco = request.QueryString["cuentabanco"];
                string cargas = request.QueryString["cargas"];

                if (string.IsNullOrEmpty(empresa) || string.IsNullOrEmpty(rut) || string.IsNullOrEmpty(nombre) || string.IsNullOrEmpty(paterno))
                {
                    SendError(response, "Faltan parametros obligatorios (empresa, rut, nombre, paterno)");
                    return;
                }

                string dbPath = Path.Combine(Path.Combine(RemuPath, empresa), "Wages.Mdb");
                if (!File.Exists(dbPath))
                {
                    SendError(response, "Empresa no encontrada");
                    return;
                }

                try
                {
                    string connStr = string.Format("Provider=Microsoft.Jet.OLEDB.4.0;Data Source={0}", dbPath);
                    using (OleDbConnection conn = new OleDbConnection(connStr))
                    {
                        conn.Open();
                        using (OleDbCommand cmd = new OleDbCommand("INSERT INTO [Personal] (RolUni, Nombre, Paterno, Materno, Ocupac, SBaseM, AFPper, ISAper, EMail, Nacionalidad, Direcc, SexoPe, FechaN, FInici, Depart, TipoContra, TelFax, Banco, Cuenta, CargaN, Finiquito) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, False)", conn))
                        {
                            cmd.Parameters.AddWithValue("RolUni", rut);
                            cmd.Parameters.AddWithValue("Nombre", nombre);
                            cmd.Parameters.AddWithValue("Paterno", paterno);
                            cmd.Parameters.AddWithValue("Materno", materno ?? "-");
                            cmd.Parameters.AddWithValue("Ocupac", ocupac ?? "-");
                            cmd.Parameters.AddWithValue("SBaseM", sbase ?? "0");
                            cmd.Parameters.AddWithValue("AFPper", afp ?? "SIN AFP");
                            cmd.Parameters.AddWithValue("ISAper", isa ?? "Fonasa");
                            cmd.Parameters.AddWithValue("EMail", email ?? "-");
                            cmd.Parameters.AddWithValue("Nacionalidad", nacionalidad ?? "CHILENA");
                            cmd.Parameters.AddWithValue("Direcc", direcc ?? "-");
                            cmd.Parameters.AddWithValue("SexoPe", sexo ?? "Masculino");
                            cmd.Parameters.AddWithValue("FechaN", fecnac ?? "-");
                            cmd.Parameters.AddWithValue("FInici", fecingre ?? "-");
                            cmd.Parameters.AddWithValue("Depart", depart ?? "-");
                            cmd.Parameters.AddWithValue("TipoContra", tipocontrato ?? "Indefinido");
                            cmd.Parameters.AddWithValue("TelFax", telefono ?? "-");
                            cmd.Parameters.AddWithValue("Banco", banco ?? "-");
                            cmd.Parameters.AddWithValue("Cuenta", cuentabanco ?? "-");
                            cmd.Parameters.AddWithValue("CargaN", cargas ?? "0");

                            int affected = cmd.ExecuteNonQuery();
                            SendJson(response, string.Format("{{\"success\":true,\"affected\":{0}}}", affected));
                        }
                    }
                }
                catch (Exception ex)
                {
                    SendError(response, "Error al insertar trabajador: " + ex.Message);
                }
            }
            else if (path == "/api/personal/update")
            {
                string empresa = request.QueryString["empresa"];
                string rut = request.QueryString["rut"];
                string nombre = request.QueryString["nombre"];
                string paterno = request.QueryString["paterno"];
                string materno = request.QueryString["materno"];
                string ocupac = request.QueryString["ocupac"];
                string sbase = request.QueryString["sbase"];
                string afp = request.QueryString["afp"];
                string isa = request.QueryString["isa"];
                string email = request.QueryString["email"];
                string nacionalidad = request.QueryString["nacionalidad"];
                string direcc = request.QueryString["direcc"];
                string sexo = request.QueryString["sexo"];
                string fecnac = request.QueryString["fecnac"];
                string fecingre = request.QueryString["fecingre"];
                string depart = request.QueryString["depart"];
                string tipocontrato = request.QueryString["tipocontrato"];
                string telefono = request.QueryString["telefono"];
                string banco = request.QueryString["banco"];
                string cuentabanco = request.QueryString["cuentabanco"];
                string cargas = request.QueryString["cargas"];

                if (string.IsNullOrEmpty(empresa) || string.IsNullOrEmpty(rut))
                {
                    SendError(response, "Faltan parametros obligatorios (empresa y rut)");
                    return;
                }

                string dbPath = Path.Combine(Path.Combine(RemuPath, empresa), "Wages.Mdb");
                if (!File.Exists(dbPath))
                {
                    SendError(response, "Empresa no encontrada");
                    return;
                }

                try
                {
                    string connStr = string.Format("Provider=Microsoft.Jet.OLEDB.4.0;Data Source={0}", dbPath);
                    using (OleDbConnection conn = new OleDbConnection(connStr))
                    {
                        conn.Open();
                        using (OleDbCommand cmd = new OleDbCommand("UPDATE [Personal] SET Nombre = ?, Paterno = ?, Materno = ?, Ocupac = ?, SBaseM = ?, AFPper = ?, ISAper = ?, EMail = ?, Nacionalidad = ?, Direcc = ?, SexoPe = ?, FechaN = ?, FInici = ?, Depart = ?, TipoContra = ?, TelFax = ?, Banco = ?, Cuenta = ?, CargaN = ? WHERE RolUni = ?", conn))
                        {
                            cmd.Parameters.AddWithValue("Nombre", nombre);
                            cmd.Parameters.AddWithValue("Paterno", paterno);
                            cmd.Parameters.AddWithValue("Materno", materno ?? "-");
                            cmd.Parameters.AddWithValue("Ocupac", ocupac ?? "-");
                            cmd.Parameters.AddWithValue("SBaseM", sbase ?? "0");
                            cmd.Parameters.AddWithValue("AFPper", afp ?? "SIN AFP");
                            cmd.Parameters.AddWithValue("ISAper", isa ?? "Fonasa");
                            cmd.Parameters.AddWithValue("EMail", email ?? "-");
                            cmd.Parameters.AddWithValue("Nacionalidad", nacionalidad ?? "CHILENA");
                            cmd.Parameters.AddWithValue("Direcc", direcc ?? "-");
                            cmd.Parameters.AddWithValue("SexoPe", sexo ?? "Masculino");
                            cmd.Parameters.AddWithValue("FechaN", fecnac ?? "-");
                            cmd.Parameters.AddWithValue("FInici", fecingre ?? "-");
                            cmd.Parameters.AddWithValue("Depart", depart ?? "-");
                            cmd.Parameters.AddWithValue("TipoContra", tipocontrato ?? "Indefinido");
                            cmd.Parameters.AddWithValue("TelFax", telefono ?? "-");
                            cmd.Parameters.AddWithValue("Banco", banco ?? "-");
                            cmd.Parameters.AddWithValue("Cuenta", cuentabanco ?? "-");
                            cmd.Parameters.AddWithValue("CargaN", cargas ?? "0");
                            cmd.Parameters.AddWithValue("RolUni", rut);

                            int affected = cmd.ExecuteNonQuery();
                            SendJson(response, string.Format("{{\"success\":true,\"affected\":{0}}}", affected));
                        }
                    }
                }
                catch (Exception ex)
                {
                    SendError(response, "Error al actualizar trabajador: " + ex.Message);
                }
            }
            else if (path == "/api/personal/delete")
            {
                string empresa = request.QueryString["empresa"];
                string rut = request.QueryString["rut"];

                if (string.IsNullOrEmpty(empresa) || string.IsNullOrEmpty(rut))
                {
                    SendError(response, "Faltan parametros (empresa, rut)");
                    return;
                }

                string dbPath = Path.Combine(Path.Combine(RemuPath, empresa), "Wages.Mdb");
                if (!File.Exists(dbPath))
                {
                    SendError(response, "Empresa no encontrada");
                    return;
                }

                try
                {
                    string connStr = string.Format("Provider=Microsoft.Jet.OLEDB.4.0;Data Source={0}", dbPath);
                    using (OleDbConnection conn = new OleDbConnection(connStr))
                    {
                        conn.Open();
                        // Instead of DELETE, we set Finiquito = True (soft-delete, standard in this system)
                        using (OleDbCommand cmd = new OleDbCommand("UPDATE [Personal] SET Finiquito = True WHERE RolUni = ?", conn))
                        {
                            cmd.Parameters.AddWithValue("RolUni", rut);
                            int affected = cmd.ExecuteNonQuery();
                            SendJson(response, string.Format("{{\"success\":true,\"affected\":{0}}}", affected));
                        }
                    }
                }
                catch (Exception ex)
                {
                    SendError(response, "Error al dar finiquito al trabajador: " + ex.Message);
                }
            }
            else if (path == "/api/transacciones")
            {
                string empresa = request.QueryString["empresa"];
                string rut = request.QueryString["rut"];
                if (string.IsNullOrEmpty(empresa) || string.IsNullOrEmpty(rut))
                {
                    SendError(response, "Faltan parametros 'empresa' y 'rut'");
                    return;
                }

                string dbPath = Path.Combine(Path.Combine(RemuPath, empresa), "Wages.Mdb");
                if (!File.Exists(dbPath))
                {
                    SendError(response, "Empresa no encontrada");
                    return;
                }

                string connStr = string.Format("Provider=Microsoft.Jet.OLEDB.4.0;Data Source={0}", dbPath);
                using (OleDbConnection conn = new OleDbConnection(connStr))
                {
                    conn.Open();
                    using (OleDbCommand cmd = new OleDbCommand("SELECT * FROM [Transacciones] WHERE RolUni = ? ORDER BY MesTra", conn))
                    {
                        cmd.Parameters.AddWithValue("RolUni", rut);
                        using (OleDbDataReader reader = cmd.ExecuteReader())
                        {
                            string json = ReaderToJsonArray(reader);
                            SendJson(response, json);
                        }
                    }
                }
            }
            else if (path == "/api/usuarios")
            {
                string keyDbPath = Path.Combine(RemuPath, "Key.mdb");
                if (!File.Exists(keyDbPath))
                {
                    SendError(response, "Archivo Key.mdb no encontrado");
                    return;
                }

                string connStr = string.Format("Provider=Microsoft.Jet.OLEDB.4.0;Data Source={0};Jet OLEDB:Database Password=GeMFairy", keyDbPath);
                using (OleDbConnection conn = new OleDbConnection(connStr))
                {
                    conn.Open();
                    using (OleDbCommand cmd = new OleDbCommand("SELECT Codigo, Nombre, Clave, Administrador FROM [Usuarios]", conn))
                    using (OleDbDataReader reader = cmd.ExecuteReader())
                    {
                        string json = ReaderToJsonArray(reader);
                        SendJson(response, json);
                    }
                }
            }
            else if (path == "/api/usuarios/add")
            {
                string codigo = request.QueryString["codigo"];
                string nombre = request.QueryString["nombre"];
                string clave = request.QueryString["clave"];
                string adminStr = request.QueryString["admin"];

                if (string.IsNullOrEmpty(codigo) || string.IsNullOrEmpty(nombre) || string.IsNullOrEmpty(clave))
                {
                    SendError(response, "Faltan parametros obligatorios (codigo, nombre, clave)");
                    return;
                }

                bool isAdmin = adminStr == "true" || adminStr == "1";
                string keyDbPath = Path.Combine(RemuPath, "Key.mdb");

                string connStr = string.Format("Provider=Microsoft.Jet.OLEDB.4.0;Data Source={0};Jet OLEDB:Database Password=GeMFairy", keyDbPath);
                using (OleDbConnection conn = new OleDbConnection(connStr))
                {
                    conn.Open();
                    using (OleDbCommand cmd = new OleDbCommand("INSERT INTO [Usuarios] (Codigo, Nombre, Clave, Administrador) VALUES (?, ?, ?, ?)", conn))
                    {
                        cmd.Parameters.AddWithValue("Codigo", codigo);
                        cmd.Parameters.AddWithValue("Nombre", nombre);
                        cmd.Parameters.AddWithValue("Clave", clave);
                        cmd.Parameters.AddWithValue("Administrador", isAdmin);

                        int affected = cmd.ExecuteNonQuery();
                        SendJson(response, string.Format("{{\"success\":true,\"affected\":{0}}}", affected));
                    }
                }
            }
            else if (path == "/api/usuarios/delete")
            {
                string codigo = request.QueryString["codigo"];
                if (string.IsNullOrEmpty(codigo))
                {
                    SendError(response, "Falta parametro 'codigo'");
                    return;
                }

                string keyDbPath = Path.Combine(RemuPath, "Key.mdb");
                string connStr = string.Format("Provider=Microsoft.Jet.OLEDB.4.0;Data Source={0};Jet OLEDB:Database Password=GeMFairy", keyDbPath);
                using (OleDbConnection conn = new OleDbConnection(connStr))
                {
                    conn.Open();
                    using (OleDbCommand cmd = new OleDbCommand("DELETE FROM [Usuarios] WHERE Codigo = ?", conn))
                    {
                        cmd.Parameters.AddWithValue("Codigo", codigo);
                        int affected = cmd.ExecuteNonQuery();
                        SendJson(response, string.Format("{{\"success\":true,\"affected\":{0}}}", affected));
                    }
                }
            }
            else if (path == "/api/parametros")
            {
                string ntMainPath = Path.Combine(BasePath, "NT_Main.mdb");
                if (!File.Exists(ntMainPath))
                {
                    SendError(response, "Archivo NT_Main.mdb no encontrado");
                    return;
                }

                string connStr = string.Format("Provider=Microsoft.Jet.OLEDB.4.0;Data Source={0};Jet OLEDB:Database Password=nt2015", ntMainPath);
                using (OleDbConnection conn = new OleDbConnection(connStr))
                {
                    conn.Open();
                    // Load global parameters joined with their type descriptions
                    using (OleDbCommand cmd = new OleDbCommand("SELECT P.Id_Parametro, T.TipDescripcion AS CodParametro, P.ValorParametro AS ValParametro, 'Periodo: ' & P.MesParametro & '/' & P.AnioParametro AS DesParametro FROM [NT_Parametro] P INNER JOIN [NT_TipoParametro] T ON P.TipParametro = T.TipParametro ORDER BY P.Id_Parametro DESC", conn))
                    using (OleDbDataReader reader = cmd.ExecuteReader())
                    {
                        string json = ReaderToJsonArray(reader);
                        SendJson(response, json);
                    }
                }
            }
            else if (path == "/api/comunas")
            {
                string ntMainPath = Path.Combine(BasePath, "NT_Main.mdb");
                string connStr = string.Format("Provider=Microsoft.Jet.OLEDB.4.0;Data Source={0};Jet OLEDB:Database Password=nt2015", ntMainPath);
                using (OleDbConnection conn = new OleDbConnection(connStr))
                {
                    conn.Open();
                    using (OleDbCommand cmd = new OleDbCommand("SELECT NomComuna, CodComuna FROM [NT_Comuna] ORDER BY NomComuna", conn))
                    using (OleDbDataReader reader = cmd.ExecuteReader())
                    {
                        string json = ReaderToJsonArray(reader);
                        SendJson(response, json);
                    }
                }
            }
            else
            {
                response.StatusCode = (int)HttpStatusCode.NotFound;
                SendJson(response, "{\"error\":\"Endpoint de API no encontrado\"}");
            }
        }

        private static void SendJson(HttpListenerResponse response, string json)
        {
            byte[] buffer = Encoding.UTF8.GetBytes(json);
            response.ContentLength64 = buffer.Length;
            response.OutputStream.Write(buffer, 0, buffer.Length);
            response.Close();
        }

        private static void SendError(HttpListenerResponse response, string message)
        {
            response.StatusCode = (int)HttpStatusCode.InternalServerError;
            string errJson = string.Format("{{\"error\":\"{0}\"}}", EscapeJson(message));
            SendJson(response, errJson);
        }

        private static Dictionary<string, string> ParsePostBody(HttpListenerRequest request)
        {
            var dict = new Dictionary<string, string>();
            if (!request.HasEntityBody) return dict;
            try
            {
                using (var reader = new StreamReader(request.InputStream, request.ContentEncoding ?? Encoding.UTF8))
                {
                    string body = reader.ReadToEnd();
                    string[] pairs = body.Split('&');
                    foreach (string pair in pairs)
                    {
                        string[] parts = pair.Split('=');
                        if (parts.Length == 2)
                        {
                            string key = WebUtility.UrlDecode(parts[0]);
                            string val = WebUtility.UrlDecode(parts[1]);
                            dict[key] = val;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error al parsear POST body: " + ex.Message);
            }
            return dict;
        }

        private static string GetParam(HttpListenerRequest request, Dictionary<string, string> postData, string key)
        {
            if (postData != null && postData.ContainsKey(key)) return postData[key];
            return request.QueryString[key];
        }

        private static void EnsureEmpresaColumns(OleDbConnection conn)
        {
            try
            {
                var schema = conn.GetSchema("Columns", new string[] { null, null, "Empresa" });
                List<string> existingCols = new List<string>();
                foreach (System.Data.DataRow row in schema.Rows)
                {
                    existingCols.Add(row["COLUMN_NAME"].ToString().ToLower());
                }

                string[] colsToAdd = new string[] {
                    "EmailEmp TEXT(255)",
                    "Mutualidad TEXT(100)",
                    "LogoBase64 MEMO"
                };

                foreach (string colDef in colsToAdd)
                {
                    string colName = colDef.Split(' ')[0].ToLower();
                    if (!existingCols.Contains(colName))
                    {
                        try
                        {
                            using (OleDbCommand alterCmd = new OleDbCommand("ALTER TABLE [Empresa] ADD COLUMN " + colDef, conn))
                            {
                                alterCmd.ExecuteNonQuery();
                                Console.WriteLine("Columna agregada a Empresa: " + colDef);
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Error al agregar columna " + colDef + ": " + ex.Message);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error en EnsureEmpresaColumns: " + ex.Message);
            }
        }

        public static string RowToJson(OleDbDataReader reader)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("{");
            for (int i = 0; i < reader.FieldCount; i++)
            {
                if (i > 0) sb.Append(",");
                string name = reader.GetName(i);
                object val = reader.GetValue(i);
                sb.AppendFormat("\"{0}\":", EscapeJson(name));
                if (val == DBNull.Value || val == null)
                {
                    sb.Append("null");
                }
                else if (val is bool)
                {
                    sb.Append(((bool)val) ? "true" : "false");
                }
                else if (val is int || val is long || val is short || val is byte || val is int)
                {
                    sb.Append(val.ToString());
                }
                else if (val is double || val is float || val is decimal)
                {
                    sb.AppendFormat(CultureInfo.InvariantCulture, "{0}", val);
                }
                else if (val is DateTime)
                {
                    sb.AppendFormat("\"{0:yyyy-MM-dd HH:mm:ss}\"", val);
                }
                else
                {
                    sb.AppendFormat("\"{0}\"", EscapeJson(val.ToString()));
                }
            }
            sb.Append("}");
            return sb.ToString();
        }

        public static string ReaderToJsonArray(OleDbDataReader reader)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("[");
            bool first = true;
            while (reader.Read())
            {
                if (!first) sb.Append(",");
                sb.Append(RowToJson(reader));
                first = false;
            }
            sb.Append("]");
            return sb.ToString();
        }

        public static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            StringBuilder sb = new StringBuilder();
            foreach (char c in s)
            {
                switch (c)
                {
                    case '\\': sb.Append("\\\\"); break;
                    case '\"': sb.Append("\\\""); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 32)
                        {
                            sb.AppendFormat("\\u{0:x4}", (int)c);
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }
            return sb.ToString();
        }
    }
}
